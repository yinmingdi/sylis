import {
  AuditArchiveStatus,
  SecurityAuditCategory,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import {
  AuditArchiveProgressStage,
  AuditArchiveRecordKind,
  AuditArchiveResultType,
  AuditArchiveSchemaVersion,
  JobProgressEtaReliability,
} from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { jsonReplacer } from "@sylis/utils";
import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createZstdCompress } from "node:zlib";

import { ArtifactStorage } from "../adapters/artifact-storage";

const MEMBERSHIP_BATCH_SIZE = 1_000;

interface AuditArchiveInput {
  archiveId: string;
  category: SecurityAuditCategory;
  rangeStart: Date;
  rangeEnd: Date;
  policyVersion: string;
}

export function createAuditArchiveHandler(
  database: SylisDatabase,
  storage: ArtifactStorage,
) {
  return async (attempt: ClaimedAttempt, executor: JobExecutor) => {
    const input = archiveInput(attempt.inputRef);
    let archive = await database.auditArchive.findUnique({
      where: { id: input.archiveId },
    });
    if (!archive) {
      await executor.progress(attempt, {
        stage: AuditArchiveProgressStage.SNAPSHOTTING,
        processed: 0,
        total: null,
        etaReliability: JobProgressEtaReliability.ESTIMATING,
      });
      archive = await freezeArchive(database, attempt, input);
    }
    assertArchiveInput(archive, attempt, input);
    if (archive.status !== AuditArchiveStatus.PENDING) {
      return archiveResult(archive);
    }

    await executor.progress(attempt, {
      stage: AuditArchiveProgressStage.HASHING,
      processed: 0,
      total: Number(archive.eventCount),
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
    const contentHash = await compressedContentHash(database, archive.id);
    const compressed = compressedArchive(database, archive.id);
    await executor.progress(attempt, {
      stage: AuditArchiveProgressStage.ENCRYPTING,
      processed: 0,
      total: Number(archive.eventCount),
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
    const stored = await storage.putAuditArchive(
      archive.id,
      compressed,
      contentHash,
    );
    archive = await database.auditArchive.update({
      where: { id: archive.id },
      data: {
        status: AuditArchiveStatus.ACTIVE,
        objectRef: stored.objectRef,
        contentHash: stored.contentHash,
        encryptionVersion: stored.encryptionVersion,
      },
    });
    await executor.progress(attempt, {
      stage: AuditArchiveProgressStage.RECORDED,
      processed: Number(archive.eventCount),
      total: Number(archive.eventCount),
      etaSeconds: 0,
      etaReliability: JobProgressEtaReliability.HIGH,
    });
    return archiveResult(archive);
  };
}

export function createAuditArchivePurgeHandler(
  database: SylisDatabase,
  storage: ArtifactStorage,
) {
  return async (attempt: ClaimedAttempt, executor: JobExecutor) => {
    const archiveId = requiredUuid(
      attempt.inputRef.requestId,
      "AUDIT_ARCHIVE_NOT_FOUND",
    );
    const archive = await database.auditArchive.findUnique({
      where: { id: archiveId },
    });
    if (!archive) throw new Error("AUDIT_ARCHIVE_NOT_FOUND");
    if (
      archive.status === AuditArchiveStatus.PENDING ||
      !archive.objectRef ||
      !archive.contentHash
    ) {
      throw new Error("AUDIT_ARCHIVE_NOT_ACTIVE");
    }
    await executor.progress(attempt, {
      stage: AuditArchiveProgressStage.PURGING,
      processed: 0,
      total: 1,
      etaReliability: JobProgressEtaReliability.HIGH,
    });
    if (archive.status !== AuditArchiveStatus.PURGED) {
      await database.$transaction(async (transaction) => {
        await deleteArchivedOnlineEvents(transaction, archive.id);
        await transaction.auditArchive.update({
          where: { id: archive.id },
          data: {
            status: AuditArchiveStatus.PURGED,
            purgedAt: new Date(),
          },
        });
      });
    }
    await storage.deleteAuditArchive(archive.objectRef!, archive.contentHash!);
    await executor.progress(attempt, {
      stage: AuditArchiveProgressStage.PURGED,
      processed: 1,
      total: 1,
      etaSeconds: 0,
      etaReliability: JobProgressEtaReliability.HIGH,
    });
    return {
      resultType: AuditArchiveResultType.PURGE,
      resultId: archive.id,
      contentHash: archive.contentHash!,
    };
  };
}

async function deleteArchivedOnlineEvents(
  transaction: SylisTransaction,
  archiveId: string,
): Promise<void> {
  const securityMemberships =
    await transaction.auditArchiveSecurityEvent.findMany({
      where: { archiveId },
      select: { eventId: true },
    });
  const dataAccessMemberships =
    await transaction.auditArchiveDataAccessEvent.findMany({
      where: { archiveId },
      select: { eventId: true },
    });
  for (
    let offset = 0;
    offset < securityMemberships.length;
    offset += MEMBERSHIP_BATCH_SIZE
  ) {
    await transaction.securityAuditEvent.deleteMany({
      where: {
        id: {
          in: securityMemberships
            .slice(offset, offset + MEMBERSHIP_BATCH_SIZE)
            .map(({ eventId }) => eventId),
        },
      },
    });
  }
  for (
    let offset = 0;
    offset < dataAccessMemberships.length;
    offset += MEMBERSHIP_BATCH_SIZE
  ) {
    await transaction.dataAccessAuditEvent.deleteMany({
      where: {
        id: {
          in: dataAccessMemberships
            .slice(offset, offset + MEMBERSHIP_BATCH_SIZE)
            .map(({ eventId }) => eventId),
        },
      },
    });
  }
}

async function freezeArchive(
  database: SylisDatabase,
  attempt: ClaimedAttempt,
  input: AuditArchiveInput,
) {
  return database.$transaction(
    async (transaction) => {
      const existing = await transaction.auditArchive.findUnique({
        where: { id: input.archiveId },
      });
      if (existing) return existing;
      const archivedSecurity = new Set(
        await archivedSecurityEventIds(transaction, input),
      );
      const securityCandidates = await transaction.securityAuditEvent.findMany({
        where: {
          category: input.category,
          occurredAt: { gte: input.rangeStart, lt: input.rangeEnd },
        },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      const securityEvents = securityCandidates.filter(
        ({ id }) => !archivedSecurity.has(id),
      );
      const dataAccessEvents =
        input.category === SecurityAuditCategory.USER_SUPPORT
          ? await unarchivedDataAccessEvents(transaction, input)
          : [];
      const archive = await transaction.auditArchive.create({
        data: {
          id: input.archiveId,
          category: input.category,
          rangeStart: input.rangeStart,
          rangeEnd: input.rangeEnd,
          policyVersion: input.policyVersion,
          status: AuditArchiveStatus.PENDING,
          eventCount: BigInt(securityEvents.length + dataAccessEvents.length),
          archiveJobId: attempt.jobId,
        },
      });
      await createSecurityMemberships(
        transaction,
        archive.id,
        securityEvents.map(({ id }) => id),
      );
      await createDataAccessMemberships(
        transaction,
        archive.id,
        dataAccessEvents.map(({ id }) => id),
      );
      return archive;
    },
    { isolationLevel: "Serializable" },
  );
}

async function createSecurityMemberships(
  transaction: SylisTransaction,
  archiveId: string,
  eventIds: readonly string[],
): Promise<void> {
  for (
    let offset = 0;
    offset < eventIds.length;
    offset += MEMBERSHIP_BATCH_SIZE
  ) {
    await transaction.auditArchiveSecurityEvent.createMany({
      data: eventIds
        .slice(offset, offset + MEMBERSHIP_BATCH_SIZE)
        .map((eventId, index) => ({
          archiveId,
          eventId,
          position: BigInt(offset + index),
        })),
    });
  }
}

async function createDataAccessMemberships(
  transaction: SylisTransaction,
  archiveId: string,
  eventIds: readonly string[],
): Promise<void> {
  for (
    let offset = 0;
    offset < eventIds.length;
    offset += MEMBERSHIP_BATCH_SIZE
  ) {
    await transaction.auditArchiveDataAccessEvent.createMany({
      data: eventIds
        .slice(offset, offset + MEMBERSHIP_BATCH_SIZE)
        .map((eventId, index) => ({
          archiveId,
          eventId,
          position: BigInt(offset + index),
        })),
    });
  }
}

async function compressedContentHash(
  database: SylisDatabase,
  archiveId: string,
): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(
    Readable.from(archiveRecords(database, archiveId)),
    createZstdCompress(),
    new Writable({
      write(chunk: Buffer | string, encoding, callback) {
        hash.update(
          typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk,
        );
        callback();
      },
    }),
  );
  return `sha256:${hash.digest("hex")}`;
}

function compressedArchive(database: SylisDatabase, archiveId: string) {
  const records = Readable.from(archiveRecords(database, archiveId));
  const compressed = createZstdCompress();
  records.once("error", (error) => compressed.destroy(error));
  return records.pipe(compressed);
}

async function* archiveRecords(
  database: SylisDatabase,
  archiveId: string,
): AsyncGenerator<Buffer> {
  const archive = await database.auditArchive.findUniqueOrThrow({
    where: { id: archiveId },
  });
  yield line({
    recordKind: AuditArchiveRecordKind.MANIFEST,
    schemaVersion: AuditArchiveSchemaVersion.V1,
    archiveId: archive.id,
    category: archive.category,
    rangeStart: archive.rangeStart.toISOString(),
    rangeEnd: archive.rangeEnd.toISOString(),
    policyVersion: archive.policyVersion,
    eventCount: archive.eventCount,
    createdAt: archive.createdAt.toISOString(),
  });
  const securityMemberships = await database.auditArchiveSecurityEvent.findMany(
    {
      where: { archiveId },
      orderBy: { position: "asc" },
    },
  );
  const securityEvents = await database.securityAuditEvent.findMany({
    where: { id: { in: securityMemberships.map(({ eventId }) => eventId) } },
  });
  const securityById = new Map(
    securityEvents.map((event) => [event.id, event]),
  );
  for (const membership of securityMemberships) {
    const event = securityById.get(membership.eventId);
    if (!event) throw new Error("AUDIT_ARCHIVE_SECURITY_EVENT_MISSING");
    yield line({
      recordKind: AuditArchiveRecordKind.SECURITY_EVENT,
      event: redact(serializable(event)),
    });
  }
  const dataAccessMemberships =
    await database.auditArchiveDataAccessEvent.findMany({
      where: { archiveId },
      orderBy: { position: "asc" },
    });
  const dataAccessEvents = await database.dataAccessAuditEvent.findMany({
    where: { id: { in: dataAccessMemberships.map(({ eventId }) => eventId) } },
  });
  const dataAccessById = new Map(
    dataAccessEvents.map((event) => [event.id, event]),
  );
  for (const membership of dataAccessMemberships) {
    const event = dataAccessById.get(membership.eventId);
    if (!event) throw new Error("AUDIT_ARCHIVE_DATA_ACCESS_EVENT_MISSING");
    yield line({
      recordKind: AuditArchiveRecordKind.DATA_ACCESS_EVENT,
      event: redact(serializable(event)),
    });
  }
}

async function archivedSecurityEventIds(
  transaction: SylisTransaction,
  input: AuditArchiveInput,
): Promise<string[]> {
  const memberships = await transaction.auditArchiveSecurityEvent.findMany({
    where: {
      archive: {
        category: input.category,
        rangeStart: { lt: input.rangeEnd },
        rangeEnd: { gt: input.rangeStart },
      },
    },
    select: { eventId: true },
  });
  return memberships.map(({ eventId }) => eventId);
}

async function archivedDataAccessEventIds(
  transaction: SylisTransaction,
  input: AuditArchiveInput,
): Promise<string[]> {
  const memberships = await transaction.auditArchiveDataAccessEvent.findMany({
    where: {
      archive: {
        category: input.category,
        rangeStart: { lt: input.rangeEnd },
        rangeEnd: { gt: input.rangeStart },
      },
    },
    select: { eventId: true },
  });
  return memberships.map(({ eventId }) => eventId);
}

async function unarchivedDataAccessEvents(
  transaction: SylisTransaction,
  input: AuditArchiveInput,
): Promise<Array<{ id: string }>> {
  const archived = new Set(
    await archivedDataAccessEventIds(transaction, input),
  );
  const candidates = await transaction.dataAccessAuditEvent.findMany({
    where: {
      occurredAt: { gte: input.rangeStart, lt: input.rangeEnd },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return candidates.filter(({ id }) => !archived.has(id));
}

function archiveInput(
  value: Readonly<Record<string, unknown>>,
): AuditArchiveInput {
  const archiveId = requiredUuid(
    value.requestId,
    "AUDIT_ARCHIVE_INPUT_INVALID",
  );
  const category = enumValue(
    value.category,
    SecurityAuditCategory,
    "AUDIT_ARCHIVE_INPUT_INVALID",
  );
  const rangeStart = date(value.rangeStart, "AUDIT_ARCHIVE_INPUT_INVALID");
  const rangeEnd = date(value.rangeEnd, "AUDIT_ARCHIVE_INPUT_INVALID");
  if (rangeEnd <= rangeStart) throw new Error("AUDIT_ARCHIVE_INPUT_INVALID");
  if (
    typeof value.policyVersion !== "string" ||
    value.policyVersion.length < 1 ||
    value.policyVersion.length > 120
  ) {
    throw new Error("AUDIT_ARCHIVE_INPUT_INVALID");
  }
  return {
    archiveId,
    category,
    rangeStart,
    rangeEnd,
    policyVersion: value.policyVersion,
  };
}

function assertArchiveInput(
  archive: {
    id: string;
    archiveJobId: string;
    category: SecurityAuditCategory;
    rangeStart: Date;
    rangeEnd: Date;
    policyVersion: string;
  },
  attempt: ClaimedAttempt,
  input: AuditArchiveInput,
): void {
  if (
    archive.id !== input.archiveId ||
    archive.archiveJobId !== attempt.jobId ||
    archive.category !== input.category ||
    archive.rangeStart.getTime() !== input.rangeStart.getTime() ||
    archive.rangeEnd.getTime() !== input.rangeEnd.getTime() ||
    archive.policyVersion !== input.policyVersion
  ) {
    throw new Error("AUDIT_ARCHIVE_INPUT_MISMATCH");
  }
}

function archiveResult(archive: {
  id: string;
  status: AuditArchiveStatus;
  eventCount: bigint;
  contentHash: string | null;
}) {
  if (archive.status === AuditArchiveStatus.PENDING || !archive.contentHash) {
    throw new Error("AUDIT_ARCHIVE_NOT_ACTIVE");
  }
  return {
    resultType: AuditArchiveResultType.ARCHIVE,
    resultId: archive.id,
    contentHash: archive.contentHash,
    summary: {
      eventCount: Number(archive.eventCount),
      schemaVersion: AuditArchiveSchemaVersion.V1,
    },
  };
}

function requiredUuid(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(code);
  }
  return value;
}

function date(value: unknown, code: string): Date {
  const parsed = new Date(typeof value === "string" ? value : Number.NaN);
  if (!Number.isFinite(parsed.getTime())) throw new Error(code);
  return parsed;
}

function enumValue<T extends Record<string, string>>(
  value: unknown,
  values: T,
  code: string,
): T[keyof T] {
  if (typeof value !== "string" || !Object.values(values).includes(value)) {
    throw new Error(code);
  }
  return value as T[keyof T];
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
