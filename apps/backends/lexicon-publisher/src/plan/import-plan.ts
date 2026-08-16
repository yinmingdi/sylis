import {
  DatabaseSchemaVersion,
  Prisma,
  type SylisTransaction,
} from "@sylis/database";
import { stat } from "node:fs/promises";

import { ARTIFACT_TARGET_TABLES } from "../artifact/mapping-registry";
import type { ArtifactPreflightResult } from "../artifact/preflight";

export enum ImportPlanMode {
  READ_ONLY_DRY_RUN = "READ_ONLY_DRY_RUN",
}

export enum ImportPlanResult {
  CREATE_DRAFT_RELEASE = "CREATE_DRAFT_RELEASE",
  REUSE_EXISTING_RELEASE = "REUSE_EXISTING_RELEASE",
}

export enum ImportPlanLockStatus {
  AVAILABLE = "AVAILABLE",
  HELD_BY_ANOTHER_SESSION = "HELD_BY_ANOTHER_SESSION",
}

export interface ImportPlan {
  mode: ImportPlanMode;
  artifact: {
    uri: string;
    compressedBytes: number;
    artifactHash: string;
    contentHash: string;
    releaseVersion: string;
  };
  database: {
    schemaVersion: DatabaseSchemaVersion;
    databaseName: string;
    databaseUser: string;
    serverVersionNumber: number;
    schemaReady: boolean;
    invariantsReady: boolean;
    publisherPrivilegesReady: boolean;
    lockStatus: ImportPlanLockStatus;
  };
  current: {
    lexiconId: string | null;
    activeReleaseId: string | null;
    activeReleaseVersion: string | null;
  };
  result: ImportPlanResult;
  existingReleaseId: string | null;
  entityCounts: Record<string, number>;
  totalEntities: number;
  estimatedStagingBytes: number;
}

export async function createImportPlan(
  database: SylisTransaction,
  artifactPath: string,
  preflight: ArtifactPreflightResult,
): Promise<ImportPlan> {
  const [file, existing, lexicon, compatibility, lock] = await Promise.all([
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
    inspectCompatibility(database),
    database.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(
        hashtextextended(${preflight.manifest.lexiconKey}, 0)
      ) AS acquired
    `,
  ]);
  const totalEntities = Object.values(preflight.counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  return {
    mode: ImportPlanMode.READ_ONLY_DRY_RUN,
    artifact: {
      uri: artifactPath,
      compressedBytes: file.size,
      artifactHash: preflight.artifactHash,
      contentHash: preflight.contentHash,
      releaseVersion: preflight.manifest.releaseVersion,
    },
    database: {
      ...compatibility,
      lockStatus: lock[0]?.acquired
        ? ImportPlanLockStatus.AVAILABLE
        : ImportPlanLockStatus.HELD_BY_ANOTHER_SESSION,
    },
    current: {
      lexiconId: lexicon?.id ?? null,
      activeReleaseId: lexicon?.activeReleaseId ?? null,
      activeReleaseVersion: lexicon?.activeRelease?.version ?? null,
    },
    result: existing
      ? ImportPlanResult.REUSE_EXISTING_RELEASE
      : ImportPlanResult.CREATE_DRAFT_RELEASE,
    existingReleaseId: existing?.id ?? null,
    entityCounts: preflight.counts,
    totalEntities,
    // JSONB plus staging indexes normally require more space than the compressed input.
    estimatedStagingBytes: Math.max(file.size * 8, totalEntities * 768),
  };
}

async function inspectCompatibility(database: SylisTransaction): Promise<{
  schemaVersion: DatabaseSchemaVersion;
  databaseName: string;
  databaseUser: string;
  serverVersionNumber: number;
  schemaReady: boolean;
  invariantsReady: boolean;
  publisherPrivilegesReady: boolean;
}> {
  const requiredPrivileges = [
    ...ARTIFACT_TARGET_TABLES.flatMap((table) => [
      { privilege: "SELECT", table },
      { privilege: "INSERT", table },
    ]),
    { privilege: "SELECT", table: "Lexicon" },
    { privilege: "INSERT", table: "Lexicon" },
    { privilege: "SELECT", table: "TextProcessingProfile" },
    { privilege: "INSERT", table: "TextProcessingProfile" },
    { privilege: "SELECT", table: "LexiconRelease" },
    { privilege: "INSERT", table: "LexiconRelease" },
    { privilege: "UPDATE", table: "LexiconRelease" },
    { privilege: "SELECT", table: "PublishRun" },
    { privilege: "UPDATE", table: "PublishRun" },
    { privilege: "SELECT", table: "LexiconStagingRecord" },
    { privilege: "INSERT", table: "LexiconStagingRecord" },
    { privilege: "DELETE", table: "LexiconStagingRecord" },
  ] as const;
  const requiredPrivilegeRows = Prisma.join(
    requiredPrivileges.map(
      ({ privilege, table }) => Prisma.sql`(${table}, ${privilege})`,
    ),
  );
  const [catalog] = await database.$queryRaw<
    Array<{
      database_name: string;
      database_user: string;
      server_version_number: number;
      schema_ready: boolean;
      invariants_ready: boolean;
      publisher_privileges_ready: boolean;
    }>
  >`
    WITH required(table_name, privilege) AS (
      VALUES ${requiredPrivilegeRows}
    )
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      current_setting('server_version_num')::int AS server_version_number,
      (
        SELECT bool_and(
          to_regclass(format('%I.%I', 'public', required.table_name)) IS NOT NULL
        )
        FROM required
      ) AS schema_ready,
      (
        to_regprocedure('public.sylis_assert_sense_structure()') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'Lexicon_active_release_guard'
            AND NOT tgisinternal
        )
        AND EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'LexiconRelease_status_transition_guard'
            AND NOT tgisinternal
        )
      ) AS invariants_ready,
      (
        SELECT bool_and(
          CASE
            WHEN to_regclass(
              format('%I.%I', 'public', required.table_name)
            ) IS NULL THEN false
            ELSE has_table_privilege(
              current_user,
              format('%I.%I', 'public', required.table_name),
              required.privilege
            )
          END
        )
        FROM required
      ) AS publisher_privileges_ready
  `;
  return {
    schemaVersion: DatabaseSchemaVersion.V0_0_1,
    databaseName: catalog?.database_name ?? "",
    databaseUser: catalog?.database_user ?? "",
    serverVersionNumber: catalog?.server_version_number ?? 0,
    schemaReady: catalog?.schema_ready ?? false,
    invariantsReady: catalog?.invariants_ready ?? false,
    publisherPrivilegesReady: catalog?.publisher_privileges_ready ?? false,
  };
}
