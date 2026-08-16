import {
  SecurityAuditCategory,
  SecurityAuditResult,
  SupportResourceKind,
  OperatorRole,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import {
  AuditEventStreamKind,
  AuditExportProgressStage,
  AuditExportRecordKind,
  AuditExportResultType,
  AuditExportSchemaVersion,
  JobProgressEtaReliability,
} from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { jsonReplacer } from "@sylis/utils";
import { Readable } from "node:stream";
import { createZstdCompress } from "node:zlib";

import { ArtifactStorage } from "../adapters/artifact-storage";

const PAGE_SIZE = 500;
const MAX_EXPORT_RANGE_MS = 93 * 86_400_000;

interface AuditExportSnapshot {
  schemaVersion: AuditExportSchemaVersion;
  streams: AuditEventStreamKind[];
  from: Date;
  to: Date;
  snapshotAt: Date;
  retentionPolicies: Record<string, string>;
  category?: SecurityAuditCategory;
  result?: SecurityAuditResult;
  action?: string;
  actorRole?: OperatorRole;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  correlationId?: string;
  actionDigest?: string;
  deploymentId?: string;
}

export function createAuditExportHandler(
  database: SylisDatabase,
  storage: ArtifactStorage,
) {
  return async (attempt: ClaimedAttempt, executor: JobExecutor) => {
    const requestId = requiredRequestId(attempt.inputRef);
    const request = await database.auditExport.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new Error("AUDIT_EXPORT_REQUEST_NOT_FOUND");
    if (request.artifactRef && request.contentHash && request.expiresAt) {
      return {
        resultType: AuditExportResultType.AUDIT_EXPORT,
        resultId: request.id,
        contentHash: request.contentHash,
        summary: {
          eventCount: Number(request.eventCount ?? 0n),
          schemaVersion: AuditExportSchemaVersion.V1,
        },
      };
    }
    const snapshot = parseSnapshot(request.querySnapshot);
    await assertRetentionSnapshot(database, snapshot);
    const progress = { count: 0 };
    await executor.progress(attempt, {
      stage: AuditExportProgressStage.QUERYING,
      processed: 0,
      total: null,
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
    const ndjson = Readable.from(
      auditRecords(
        database,
        snapshot,
        request.createdAt,
        attempt,
        executor,
        progress,
      ),
    );
    const compressed = createZstdCompress();
    ndjson.once("error", (error) => compressed.destroy(error));
    ndjson.pipe(compressed);
    await executor.progress(attempt, {
      stage: AuditExportProgressStage.STREAMING_ARTIFACT,
      processed: 0,
      total: null,
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
    const artifact = await storage.putAuditExport(request.id, compressed);
    await database.auditExport.update({
      where: { id: request.id },
      data: {
        artifactRef: artifact.artifactUri,
        eventCount: BigInt(progress.count),
        contentHash: artifact.contentHash,
        expiresAt: artifact.expiresAt,
      },
    });
    await executor.progress(attempt, {
      stage: AuditExportProgressStage.UPLOADED,
      processed: progress.count,
      total: progress.count,
      etaSeconds: 0,
      etaReliability: JobProgressEtaReliability.HIGH,
    });
    return {
      resultType: AuditExportResultType.AUDIT_EXPORT,
      resultId: request.id,
      contentHash: artifact.contentHash,
      summary: {
        eventCount: progress.count,
        schemaVersion: AuditExportSchemaVersion.V1,
      },
    };
  };
}

function requiredRequestId(input: Readonly<Record<string, unknown>>): string {
  if (typeof input.requestId !== "string" || !input.requestId) {
    throw new Error("AUDIT_EXPORT_REQUEST_NOT_FOUND");
  }
  return input.requestId;
}

async function* auditRecords(
  database: SylisDatabase,
  snapshot: AuditExportSnapshot,
  exportedAt: Date,
  attempt: ClaimedAttempt,
  executor: JobExecutor,
  progress: { count: number },
): AsyncGenerator<Buffer> {
  yield line({
    recordKind: AuditExportRecordKind.MANIFEST,
    schemaVersion: snapshot.schemaVersion,
    exportedAt: exportedAt.toISOString(),
    query: serializableSnapshot(snapshot),
  });
  for (const stream of snapshot.streams) {
    let cursor: string | undefined;
    do {
      if (await executor.isCancellationRequested(attempt)) {
        throw new Error("JOB_CANCELLED");
      }
      const records =
        stream === AuditEventStreamKind.SECURITY
          ? await securityPage(database, snapshot, cursor)
          : await dataAccessPage(database, snapshot, cursor);
      for (const event of records) {
        yield line({
          recordKind:
            stream === AuditEventStreamKind.SECURITY
              ? AuditExportRecordKind.SECURITY_EVENT
              : AuditExportRecordKind.DATA_ACCESS_EVENT,
          event: redact(serializable(event)),
        });
        progress.count += 1;
      }
      cursor = records.length === PAGE_SIZE ? records.at(-1)?.id : undefined;
      if (records.length > 0) {
        await executor.progress(attempt, {
          stage: AuditExportProgressStage.STREAMING_ARTIFACT,
          processed: progress.count,
          total: null,
          etaReliability: JobProgressEtaReliability.ESTIMATING,
        });
      }
    } while (cursor);
  }
}

function securityPage(
  database: SylisDatabase,
  snapshot: AuditExportSnapshot,
  cursor: string | undefined,
) {
  const where: PrismaTypes.SecurityAuditEventWhereInput = {
    occurredAt: snapshotRange(snapshot),
    category: snapshot.category,
    result: snapshot.result,
    action: snapshot.action,
    actorRole: snapshot.actorRole,
    actorUserId: snapshot.actorUserId,
    targetType: snapshot.targetType,
    targetId: snapshot.targetId,
    requestId: snapshot.requestId,
    correlationId: snapshot.correlationId,
    actionDigest: snapshot.actionDigest,
    deploymentId: snapshot.deploymentId,
  };
  return database.securityAuditEvent.findMany({
    where,
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

function dataAccessPage(
  database: SylisDatabase,
  snapshot: AuditExportSnapshot,
  cursor: string | undefined,
) {
  const resourceKind = optionalEnum(snapshot.targetType, SupportResourceKind);
  if (
    (snapshot.targetType && !resourceKind) ||
    snapshot.category ||
    snapshot.action ||
    snapshot.actorRole ||
    snapshot.correlationId ||
    snapshot.actionDigest ||
    snapshot.deploymentId
  ) {
    return Promise.resolve([]);
  }
  const where: PrismaTypes.DataAccessAuditEventWhereInput = {
    occurredAt: snapshotRange(snapshot),
    result: snapshot.result,
    actorUserId: snapshot.actorUserId,
    resourceKind,
    resourceId: snapshot.targetId,
    requestId: snapshot.requestId,
  };
  return database.dataAccessAuditEvent.findMany({
    where,
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

function parseSnapshot(value: unknown): AuditExportSnapshot {
  const input = record(value, "AUDIT_EXPORT_QUERY_INVALID");
  if (input.schemaVersion !== AuditExportSchemaVersion.V1) {
    throw new Error("AUDIT_EXPORT_SCHEMA_UNSUPPORTED");
  }
  if (!Array.isArray(input.streams) || input.streams.length === 0) {
    throw new Error("AUDIT_EXPORT_STREAMS_INVALID");
  }
  const streams = input.streams.map((value) =>
    requiredEnum(value, AuditEventStreamKind, "AUDIT_EXPORT_STREAMS_INVALID"),
  );
  if (new Set(streams).size !== streams.length) {
    throw new Error("AUDIT_EXPORT_STREAMS_INVALID");
  }
  const from = date(input.from, "AUDIT_EXPORT_RANGE_INVALID");
  const to = date(input.to, "AUDIT_EXPORT_RANGE_INVALID");
  const snapshotAt = date(input.snapshotAt, "AUDIT_EXPORT_SNAPSHOT_AT_INVALID");
  if (to <= from || to.getTime() - from.getTime() > MAX_EXPORT_RANGE_MS) {
    throw new Error("AUDIT_EXPORT_RANGE_INVALID");
  }
  const category = strictOptionalEnum(
    input.category,
    SecurityAuditCategory,
    "AUDIT_EXPORT_CATEGORY_INVALID",
  );
  return {
    schemaVersion: AuditExportSchemaVersion.V1,
    streams,
    from,
    to,
    snapshotAt,
    retentionPolicies: retentionPolicySnapshot(
      input.retentionPolicies,
      streams,
      category,
    ),
    category,
    result: strictOptionalEnum(
      input.result,
      SecurityAuditResult,
      "AUDIT_EXPORT_RESULT_INVALID",
    ),
    action: optionalString(input.action, "AUDIT_EXPORT_ACTION_INVALID", 200),
    actorRole: strictOptionalEnum(
      input.actorRole,
      OperatorRole,
      "AUDIT_EXPORT_ACTOR_ROLE_INVALID",
    ),
    actorUserId: optionalUuid(input.actorUserId, "AUDIT_EXPORT_ACTOR_INVALID"),
    targetType: optionalString(
      input.targetType,
      "AUDIT_EXPORT_TARGET_TYPE_INVALID",
      200,
    ),
    targetId: optionalUuid(input.targetId, "AUDIT_EXPORT_TARGET_ID_INVALID"),
    requestId: optionalString(
      input.requestId,
      "AUDIT_EXPORT_REQUEST_ID_INVALID",
      200,
    ),
    correlationId: optionalString(
      input.correlationId,
      "AUDIT_EXPORT_CORRELATION_ID_INVALID",
      200,
    ),
    actionDigest: optionalString(
      input.actionDigest,
      "AUDIT_EXPORT_ACTION_DIGEST_INVALID",
      200,
    ),
    deploymentId: optionalString(
      input.deploymentId,
      "AUDIT_EXPORT_DEPLOYMENT_ID_INVALID",
      200,
    ),
  };
}

async function assertRetentionSnapshot(
  database: SylisDatabase,
  snapshot: AuditExportSnapshot,
): Promise<void> {
  const versions = Object.entries(snapshot.retentionPolicies);
  const policies = await database.auditRetentionPolicy.findMany({
    where: {
      effectiveAt: { lte: snapshot.snapshotAt },
      category: {
        in: versions.map(([category]) => category as SecurityAuditCategory),
      },
    },
    orderBy: [{ category: "asc" }, { effectiveAt: "desc" }],
    select: { category: true, policyVersion: true },
  });
  const effective = new Map<SecurityAuditCategory, string>();
  for (const policy of policies) {
    if (!effective.has(policy.category)) {
      effective.set(policy.category, policy.policyVersion);
    }
  }
  if (
    effective.size !== versions.length ||
    versions.some(
      ([category, policyVersion]) =>
        effective.get(category as SecurityAuditCategory) !== policyVersion,
    )
  ) {
    throw new Error("AUDIT_EXPORT_RETENTION_POLICY_INVALID");
  }
}

function retentionPolicySnapshot(
  value: unknown,
  streams: readonly AuditEventStreamKind[],
  category: SecurityAuditCategory | undefined,
): Record<string, string> {
  const input = record(value, "AUDIT_EXPORT_RETENTION_POLICY_INVALID");
  const expected = new Set<SecurityAuditCategory>();
  if (streams.includes(AuditEventStreamKind.SECURITY)) {
    for (const requiredCategory of category
      ? [category]
      : Object.values(SecurityAuditCategory)) {
      expected.add(requiredCategory);
    }
  }
  if (streams.includes(AuditEventStreamKind.DATA_ACCESS)) {
    expected.add(SecurityAuditCategory.USER_SUPPORT);
  }
  const result: Record<string, string> = {};
  for (const [key, policyVersion] of Object.entries(input)) {
    if (
      !Object.values(SecurityAuditCategory).includes(
        key as SecurityAuditCategory,
      ) ||
      typeof policyVersion !== "string" ||
      policyVersion.length < 1 ||
      policyVersion.length > 120
    ) {
      throw new Error("AUDIT_EXPORT_RETENTION_POLICY_INVALID");
    }
    result[key] = policyVersion;
  }
  if (
    Object.keys(result).length !== expected.size ||
    [...expected].some((requiredCategory) => !result[requiredCategory])
  ) {
    throw new Error("AUDIT_EXPORT_RETENTION_POLICY_INVALID");
  }
  return result;
}

function serializableSnapshot(snapshot: AuditExportSnapshot) {
  return {
    ...snapshot,
    from: snapshot.from.toISOString(),
    to: snapshot.to.toISOString(),
    snapshotAt: snapshot.snapshotAt.toISOString(),
  };
}

function snapshotRange(snapshot: AuditExportSnapshot) {
  return {
    gte: snapshot.from,
    lte: new Date(
      Math.min(snapshot.to.getTime(), snapshot.snapshotAt.getTime()),
    ),
  };
}

function line(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, jsonReplacer)}\n`);
}

function serializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, jsonReplacer)) as unknown;
}

function redact(value: unknown, key = ""): unknown {
  if (
    /authorization|cookie|password|secret|token|ciphertext|encrypted.?dek|nonce|auth.?tag/i.test(
      key,
    )
  ) {
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    return value
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
      .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nested]) => [
        nestedKey,
        redact(nested, nestedKey),
      ]),
    );
  }
  return value;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
}

function date(value: unknown, code: string): Date {
  const parsed = new Date(typeof value === "string" ? value : Number.NaN);
  if (!Number.isFinite(parsed.getTime())) throw new Error(code);
  return parsed;
}

function optionalString(
  value: unknown,
  code: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new Error(code);
  }
  return value;
}

function optionalUuid(value: unknown, code: string): string | undefined {
  const parsed = optionalString(value, code, 36);
  if (
    parsed !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      parsed,
    )
  ) {
    throw new Error(code);
  }
  return parsed;
}

function optionalEnum<T extends Record<string, string>>(
  value: unknown,
  values: T,
): T[keyof T] | undefined {
  return typeof value === "string" && Object.values(values).includes(value)
    ? (value as T[keyof T])
    : undefined;
}

function requiredEnum<T extends Record<string, string>>(
  value: unknown,
  values: T,
  code: string,
): T[keyof T] {
  const parsed = optionalEnum(value, values);
  if (!parsed) throw new Error(code);
  return parsed;
}

function strictOptionalEnum<T extends Record<string, string>>(
  value: unknown,
  values: T,
  code: string,
): T[keyof T] | undefined {
  if (value === undefined) return undefined;
  const parsed = optionalEnum(value, values);
  if (!parsed) throw new Error(code);
  return parsed;
}
