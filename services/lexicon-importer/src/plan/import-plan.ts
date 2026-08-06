import type { SylisDatabase } from "@sylis/database";
import { stat } from "node:fs/promises";

import type { ArtifactPreflightResult } from "../artifact/preflight";

export interface ImportPlan {
  mode: "READ_ONLY_DRY_RUN";
  artifact: {
    uri: string;
    compressedBytes: number;
    artifactHash: string;
    contentHash: string;
    releaseVersion: string;
  };
  current: {
    lexiconId: string | null;
    activeReleaseId: string | null;
    activeReleaseVersion: string | null;
  };
  result: "REUSE_EXISTING_RELEASE" | "CREATE_DRAFT_RELEASE";
  existingReleaseId: string | null;
  entityCounts: Record<string, number>;
  totalEntities: number;
  estimatedStagingBytes: number;
}

export async function createImportPlan(
  database: SylisDatabase,
  artifactPath: string,
  preflight: ArtifactPreflightResult,
): Promise<ImportPlan> {
  const [file, existing, lexicon] = await Promise.all([
    stat(artifactPath),
    database.lexiconRelease.findUnique({
      where: { contentHash: preflight.contentHash },
      select: { id: true },
    }),
    database.lexicon.findUnique({
      where: { key: preflight.manifest.lexiconKey },
      select: {
        id: true,
        activeReleaseId: true,
        activeRelease: { select: { version: true } },
      },
    }),
  ]);
  const totalEntities = Object.values(preflight.counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  return {
    mode: "READ_ONLY_DRY_RUN",
    artifact: {
      uri: artifactPath,
      compressedBytes: file.size,
      artifactHash: preflight.artifactHash,
      contentHash: preflight.contentHash,
      releaseVersion: preflight.manifest.releaseVersion,
    },
    current: {
      lexiconId: lexicon?.id ?? null,
      activeReleaseId: lexicon?.activeReleaseId ?? null,
      activeReleaseVersion: lexicon?.activeRelease?.version ?? null,
    },
    result: existing ? "REUSE_EXISTING_RELEASE" : "CREATE_DRAFT_RELEASE",
    existingReleaseId: existing?.id ?? null,
    entityCounts: preflight.counts,
    totalEntities,
    // JSONB plus staging indexes normally require more space than the compressed input.
    // This estimate is deliberately conservative and is not a quota guarantee.
    estimatedStagingBytes: Math.max(file.size * 8, totalEntities * 768),
  };
}
