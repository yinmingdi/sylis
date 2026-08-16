import {
  AssetProcessingResultKind,
  AssetScanRejectionReason,
  AssetScanStatus,
  type AssetProcessingResult,
} from "@sylis/agent-contracts";
import { ModelOperationKind } from "@sylis/database";
import { JobKind, JobProgressEtaReliability } from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { createHash } from "node:crypto";

import { AssetApiClient } from "../adapters/asset-api-client";
import { ClamAvClient } from "../adapters/clamav";
import {
  type AssetModelOperationKind,
  ModelGatewayClient,
} from "../adapters/model-gateway-client";
import { SignedObjectStorage } from "../adapters/object-storage";
import {
  buildLexicalIndex,
  extractImageText,
  extractText,
  inspectAsset,
  type ContentProcessingLimits,
} from "../processing/safe-content";

enum AssetProgressStage {
  INPUT_VALIDATED = "INPUT_VALIDATED",
  RESULT_COMMITTED = "RESULT_COMMITTED",
}

enum AssetResultType {
  CONTENT_ASSET_REVISION = "content-asset-revision",
}

const MODEL_OPERATION_BY_JOB_KIND: Partial<
  Record<JobKind, AssetModelOperationKind>
> = {
  [JobKind.ASSET_EMBEDDING]: ModelOperationKind.EMBEDDING,
  [JobKind.ASSET_IMAGE_ANALYSIS]: ModelOperationKind.VISION_ANALYSIS,
};

export function createAssetHandler(dependencies: {
  assetApi: AssetApiClient;
  clamav: ClamAvClient;
  modelGateway: ModelGatewayClient;
  storage: SignedObjectStorage;
  limits: ContentProcessingLimits;
}) {
  return async (attempt: ClaimedAttempt, executor: JobExecutor) => {
    const task = await dependencies.assetApi.getTask(attempt);
    await executor.progress(attempt, {
      stage: AssetProgressStage.INPUT_VALIDATED,
      processed: 0,
      total: 1,
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
    let result: AssetProcessingResult;
    if (attempt.kind === JobKind.ASSET_SCAN) {
      const body = await dependencies.storage.download(
        requiredUrl(task.downloadUrl),
      );
      assertBody(task.contentHash, task.byteSize, body);
      let rejectedResult: AssetProcessingResult | null = null;
      try {
        await dependencies.clamav.scan(body);
      } catch (error) {
        if (!isMalwareDetected(error)) throw error;
        rejectedResult = {
          resultKind: AssetProcessingResultKind.SCAN,
          status: AssetScanStatus.REJECTED,
          rejectionReason: AssetScanRejectionReason.MALWARE_DETECTED,
          scannerVersion: "clamav/1",
        };
      }
      if (rejectedResult) {
        result = rejectedResult;
      } else {
        const inspection = await inspectAsset(
          body,
          task.mimeType,
          dependencies.limits,
        );
        if (!task.cleanUploadUrl) throw new Error("CLEAN_UPLOAD_URL_REQUIRED");
        await dependencies.storage.upload(
          task.cleanUploadUrl,
          body,
          inspection.detectedMimeType,
        );
        result = {
          ...inspection,
          status: AssetScanStatus.READY,
          scannerVersion: "clamav/1",
        };
      }
    } else if (attempt.kind === JobKind.ASSET_EXTRACT) {
      const body = await dependencies.storage.download(
        requiredUrl(task.downloadUrl),
      );
      assertBody(task.contentHash, task.byteSize, body);
      result = await extractText(body, task.mimeType, dependencies.limits);
    } else if (attempt.kind === JobKind.ASSET_OCR) {
      const body = await dependencies.storage.download(
        requiredUrl(task.downloadUrl),
      );
      assertBody(task.contentHash, task.byteSize, body);
      result = await extractImageText(body, task.mimeType, dependencies.limits);
    } else if (attempt.kind === JobKind.ASSET_LEXICAL_INDEX) {
      if (task.sourceText === undefined)
        throw new Error("ASSET_SOURCE_TEXT_REQUIRED");
      result = buildLexicalIndex(task.sourceText);
    } else {
      if (!task.modelExecutionPermitId)
        throw new Error("MODEL_PERMIT_REQUIRED");
      const operation = MODEL_OPERATION_BY_JOB_KIND[attempt.kind];
      if (!operation) throw new Error("ASSET_JOB_KIND_UNSUPPORTED");
      result = {
        resultKind: AssetProcessingResultKind.MODEL_OUTPUT,
        output: await dependencies.modelGateway.process({
          permitId: task.modelExecutionPermitId,
          assetRevisionId: task.assetRevisionId,
          operation,
        }),
      };
    }
    await dependencies.assetApi.commit(attempt, task, result);
    await executor.progress(attempt, {
      stage: AssetProgressStage.RESULT_COMMITTED,
      processed: 1,
      total: 1,
      etaSeconds: 0,
      etaReliability: JobProgressEtaReliability.HIGH,
    });
    return {
      resultType: AssetResultType.CONTENT_ASSET_REVISION,
      resultId: task.assetRevisionId,
    };
  };
}

function isMalwareDetected(error: unknown): boolean {
  return error instanceof Error && error.message === "MALWARE_DETECTED";
}

function requiredUrl(value: string | undefined): string {
  if (!value) throw new Error("ASSET_DOWNLOAD_URL_REQUIRED");
  return value;
}

function assertBody(contentHash: string, byteSize: number, body: Buffer): void {
  if (body.byteLength !== byteSize) throw new Error("ASSET_SIZE_MISMATCH");
  const actualHash = createHash("sha256").update(body).digest("hex");
  if (actualHash !== contentHash) throw new Error("ASSET_HASH_MISMATCH");
}
