import {
  BuildRunStatus,
  LexiconCompileProfile,
  type SylisDatabase,
} from "@sylis/database";
import {
  JobKind,
  RetryableJobError,
  type JobResultRef,
} from "@sylis/job-contracts";
import type { JobHandler } from "@sylis/job-runtime";
import {
  CompileProfile,
  LexicalCandidateReviewPendingError,
  compileLexicon,
  createS3ObjectStoragePort,
  publishContentAddressedObject,
  s3ObjectStorageConfigFromEnv,
} from "@sylis/lexicon-compiler";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { compilerAiOptionsFromPolicy } from "./compiler-ai-policy";
import { createLexicalCandidatePort } from "../adapters/lexical-candidate";
import { ModelGatewayStructuredGenerationPort } from "../adapters/model-gateway-client";
import { createSourceRecordRegistry } from "../adapters/source-record-registry";
import type { LexiconBuilderConfig } from "../config/builder-config";
import {
  BuildBudgetApprovalRequiredError,
  isBuildRunBudgetExceeded,
  markBuildRunBudgetApprovalPending,
} from "../runtime/build-budget";

enum LexiconBuildResultType {
  ARTIFACT = "LEXICON_ARTIFACT",
  REVIEW_BATCH = "LEXICON_REVIEW_BATCH",
}

const sha256 = (bytes: Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export function createLexiconBuildHandler(
  database: SylisDatabase,
  config: LexiconBuilderConfig,
  env: NodeJS.ProcessEnv = process.env,
): JobHandler {
  return async (job, executor): Promise<JobResultRef> => {
    if (job.kind !== JobKind.LEXICON_BUILD) {
      throw new Error("LEXICON_BUILD_KIND_INVALID");
    }
    const requestId = requestReference(job.inputRef);
    const activation = await database.buildRunActivation.findUnique({
      where: { jobId: job.jobId },
      include: { buildRun: true },
    });
    if (!activation || activation.buildRunId !== requestId) {
      throw new Error("LEXICON_BUILD_ACTIVATION_MISSING");
    }
    const request = activation.buildRun;
    if (request.status !== BuildRunStatus.APPROVED) {
      throw new Error(`LEXICON_BUILD_STATUS_INVALID:${request.status}`);
    }
    try {
      const runRoot = resolve(config.workRoot, request.id);
      const outputRoot = resolve(config.artifactRoot, request.id);
      const outputPath = resolve(outputRoot, "sylis-lexicon-v1.json.zst");
      await mkdir(runRoot, { recursive: true });
      await mkdir(outputRoot, { recursive: true });

      const manifestPath = await materializeManifest(
        request.manifestUri,
        request.inputManifestHash,
        runRoot,
      );
      const ai = compilerAiOptionsFromPolicy(
        request.budgetMicros,
        request.modelPolicy,
      );
      if (ai && !config.aiEnabled) {
        throw new Error("LEXICON_AI_DISABLED");
      }
      const generation = ai
        ? new ModelGatewayStructuredGenerationPort(
            requiredModelGatewayConfig(config, "MODEL_GATEWAY_URL"),
            config.serviceToken,
            {
              buildRunId: request.id,
              routeReleaseId: requiredModelReference(
                request.providerRouteReleaseId,
                "providerRouteReleaseId",
              ),
              credentialRevisionId: requiredModelReference(
                request.credentialRevisionId,
                "credentialRevisionId",
              ),
            },
          )
        : undefined;
      const lexicalCandidates = generation
        ? createLexicalCandidatePort(database, request.id)
        : undefined;
      const result = await compileLexicon(
        {
          manifestPath,
          profile:
            request.compileProfile === LexiconCompileProfile.PILOT_200
              ? CompileProfile.PILOT_200
              : CompileProfile.CORE_20000,
          outputPath,
          workRoot: runRoot,
          ai,
        },
        {
          structuredGeneration: generation,
          lexicalCandidates,
          sourceRecords: lexicalCandidates
            ? createSourceRecordRegistry(database)
            : undefined,
          progress: {
            report: async (event) => {
              await executor.heartbeat(job);
              await executor.progress(job, {
                stage: event.stage,
                processed: event.processed,
                total: event.total,
                message: event.message,
              });
              await executor.checkpoint(job, {
                stage: event.stage,
                processed: event.processed,
                total: event.total,
              });
              if (await executor.isCancellationRequested(job)) {
                throw new Error("JOB_CANCELLED");
              }
            },
          },
        },
      );

      const artifactHash = result.artifactSha256;
      const artifactUri = await publishArtifact(outputPath, artifactHash, env);
      await database.buildRun.update({
        where: { id: request.id },
        data: {
          status: BuildRunStatus.ARTIFACT_PUBLISHED,
          artifactUri,
          artifactHash,
          compilerRunId: result.runId,
          completedAt: new Date(),
        },
      });
      return {
        resultType: LexiconBuildResultType.ARTIFACT,
        resultId: result.runId,
        uri: artifactUri,
        contentHash: result.contentHash,
        summary: {
          headwordCount: result.headwordCount,
          sourceRecordCount: result.sourceRecordCount,
        },
      };
    } catch (error) {
      if (error instanceof LexicalCandidateReviewPendingError) {
        return {
          resultType: LexiconBuildResultType.REVIEW_BATCH,
          resultId: error.reviewBatchId,
          summary: { pendingCount: error.pendingCount },
        };
      }
      if (isBuildRunBudgetExceeded(error)) {
        await markBuildRunBudgetApprovalPending(database, request.id);
        throw new BuildBudgetApprovalRequiredError();
      }
      throw error;
    }
  };
}

async function publishArtifact(
  outputPath: string,
  artifactHash: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (env.LEXICON_ARTIFACT_ALLOW_FILE === "true") {
    return `file://${outputPath}`;
  }
  const storage = createS3ObjectStoragePort(s3ObjectStorageConfigFromEnv(env));
  const published = await publishContentAddressedObject(
    {
      inputPath: outputPath,
      sha256: artifactHash,
      objectName: "sylis-lexicon-v1.json.zst",
      contentType: "application/zstd",
    },
    storage,
  );
  return published.uri;
}

async function materializeManifest(
  uri: string,
  expectedHash: string,
  runRoot: string,
): Promise<string> {
  const path = resolve(
    runRoot,
    basename(new URL(uri).pathname || "manifest.json"),
  );
  let bytes: Buffer;
  if (uri.startsWith("file:")) {
    bytes = await readFile(new URL(uri));
  } else {
    let response: Response;
    try {
      response = await fetch(uri);
    } catch (error) {
      throw new RetryableJobError("LEXICON_MANIFEST_DOWNLOAD_FAILED", {
        cause: error,
      });
    }
    if (!response.ok) {
      const message = `LEXICON_MANIFEST_DOWNLOAD_HTTP_${response.status}`;
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableJobError(message);
      }
      throw new Error(message);
    }
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (sha256(bytes) !== expectedHash) {
    throw new Error("LEXICON_MANIFEST_HASH_MISMATCH");
  }
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}

function requiredModelGatewayConfig(
  config: LexiconBuilderConfig,
  name: "MODEL_GATEWAY_URL",
): string {
  if (!config.modelGatewayUrl)
    throw new Error(`LEXICON_AI_CONFIG_REQUIRED:${name}`);
  return config.modelGatewayUrl;
}

function requiredModelReference(value: string | null, field: string): string {
  if (!value) throw new Error(`LEXICON_AI_POLICY_INVALID:${field}`);
  return value;
}

function requestReference(input: Readonly<Record<string, unknown>>): string {
  if (typeof input.requestId !== "string" || !input.requestId) {
    throw new Error("LEXICON_BUILD_REQUEST_REF_INVALID");
  }
  return input.requestId;
}
