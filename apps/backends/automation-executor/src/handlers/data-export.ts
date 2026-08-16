import type { SylisDatabase } from "@sylis/database";
import {
  DataExportCategory,
  DataExportProgressStage,
  DataExportResultType,
  DataExportSchemaVersion,
} from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { createHash } from "node:crypto";

import { ArtifactStorage } from "../adapters/artifact-storage";
import {
  AutomationFailpoint,
  type AutomationExecutorConfig,
} from "../config/executor-config";

export function createDataExportHandler(
  database: SylisDatabase,
  storage: ArtifactStorage,
  config: AutomationExecutorConfig,
) {
  return async (attempt: ClaimedAttempt, executor: JobExecutor) => {
    const requestId = requiredRequestId(attempt.inputRef);
    const request = await database.dataExportRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new Error("DATA_EXPORT_REQUEST_NOT_FOUND");
    const categories = parseCategories(request.scope);
    await executor.progress(attempt, {
      stage: DataExportProgressStage.COLLECTING,
      processed: 0,
      total: 3,
    });
    if (config.failpoint === AutomationFailpoint.DATA_EXPORT_AFTER_COLLECTING) {
      await delay(config.failpointDelayMs);
    }
    const [profile, notebooks, exerciseAttempts] = await Promise.all([
      categories.includes(DataExportCategory.PROFILE)
        ? database.user.findUnique({
            where: { id: request.userId },
            select: {
              id: true,
              displayName: true,
              locale: true,
              timezone: true,
              createdAt: true,
              emails: {
                select: {
                  displayEmail: true,
                  verifiedAt: true,
                  isPrimary: true,
                },
              },
              consents: true,
            },
          })
        : undefined,
      categories.includes(DataExportCategory.NOTEBOOKS)
        ? database.notebook.findMany({
            where: { userId: request.userId },
            include: { items: { include: { currentRevision: true } } },
          })
        : undefined,
      categories.includes(DataExportCategory.EXERCISE_ATTEMPTS)
        ? database.exerciseAttempt.findMany({
            where: { userId: request.userId },
          })
        : undefined,
    ]);
    if (categories.includes(DataExportCategory.PROFILE) && !profile) {
      throw new Error("DATA_EXPORT_USER_NOT_FOUND");
    }
    await executor.progress(attempt, {
      stage: DataExportProgressStage.SERIALIZING,
      processed: 2,
      total: 3,
    });
    const bytes = Buffer.from(
      `${JSON.stringify({
        schemaVersion: DataExportSchemaVersion.V1,
        exportedAt: new Date().toISOString(),
        categories,
        ...(profile ? { profile } : {}),
        ...(notebooks ? { notebooks } : {}),
        ...(exerciseAttempts ? { exerciseAttempts } : {}),
      })}\n`,
    );
    const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const artifact = await storage.putDataExport(request.id, bytes);
    await database.dataExportRequest.update({
      where: { id: request.id },
      data: {
        artifactUri: artifact.artifactUri,
        expiresAt: artifact.expiresAt,
      },
    });
    await executor.progress(attempt, {
      stage: DataExportProgressStage.UPLOADED,
      processed: 3,
      total: 3,
      etaSeconds: 0,
    });
    return {
      resultType: DataExportResultType.USER_DATA_EXPORT,
      uri: artifact.artifactUri,
      contentHash,
    };
  };
}

function requiredRequestId(input: Readonly<Record<string, unknown>>): string {
  if (typeof input.requestId !== "string" || !input.requestId) {
    throw new Error("DATA_EXPORT_REQUEST_NOT_FOUND");
  }
  return input.requestId;
}

function parseCategories(value: unknown): DataExportCategory[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("DATA_EXPORT_SCOPE_INVALID");
  }
  const allowed = new Set<string>(Object.values(DataExportCategory));
  if (
    value.some(
      (category) => typeof category !== "string" || !allowed.has(category),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("DATA_EXPORT_SCOPE_INVALID");
  }
  return [...value].sort() as DataExportCategory[];
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
