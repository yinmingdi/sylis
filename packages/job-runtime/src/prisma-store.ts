import {
  AgentRunStatus,
  AgentWaitStatus,
  JobKind as DatabaseJobKind,
  JobOwnerType,
  JobAttemptStatus,
  JobStatus,
  Prisma,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import {
  definitionForJobKind,
  JobCancellationErrorCode,
  JobEventType,
  JobProgressErrorCode,
  JobProgressEtaReliability,
  JobRetryPolicy,
  JobRuntimeErrorCode,
  JobSideEffectPolicy,
  JobTerminalProgressStage,
  validateProgressInput,
  validateResultRef,
  type JobCheckpointEnvelope,
  type JobKind,
} from "@sylis/job-contracts";
import { canonicalJson } from "@sylis/utils";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import {
  JobFailureClass,
  type ClaimedAttempt,
  type JobFailure,
  type JobStore,
} from "./index";

export interface PrismaJobStoreOptions {
  checkpointKey: Uint8Array;
}

export function createPrismaJobStore(
  database: SylisDatabase,
  options: PrismaJobStoreOptions,
): JobStore {
  const checkpointKey = Buffer.from(options.checkpointKey);
  if (checkpointKey.byteLength !== 32)
    throw new Error("JOB_CHECKPOINT_KEY_INVALID");
  return {
    claim: (input) => claim(database, checkpointKey, input),
    heartbeat: (attempt, now, leaseExpiresAt) =>
      heartbeat(database, attempt, now, leaseExpiresAt),
    checkpoint: (attempt, value, now) =>
      checkpoint(database, checkpointKey, attempt, value, now),
    progress: (attempt, event, now) => progress(database, attempt, event, now),
    cancellationRequested: (attempt) =>
      cancellationRequested(database, attempt),
    finish: (attempt, result, now) => finish(database, attempt, result, now),
    fail: (attempt, failure, now) => fail(database, attempt, failure, now),
  };
}

async function claim(
  database: SylisDatabase,
  checkpointKey: Buffer,
  input: Parameters<JobStore["claim"]>[0],
): Promise<ClaimedAttempt | null> {
  if (input.kinds.length === 0) return null;
  return database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM "Job"
      WHERE kind::text IN (${Prisma.join(input.kinds)})
        AND (
          "Job"."ownerType" <> 'AGENT_RUN'
          OR "Job".kind NOT IN ('AGENT_RUN_ACTIVATION', 'AGENT_TOOL_CONTINUATION')
          OR EXISTS (
            SELECT 1
            FROM "AgentRun" run
            LEFT JOIN "AgentRun" parent ON parent.id = run."parentRunId"
            WHERE run.id = "Job"."ownerId"
              AND (run."parentRunId" IS NULL OR parent.status = 'WAITING')
          )
        )
        AND "cancelRequestedAt" IS NULL
        AND (
          (
            status IN ('QUEUED', 'RETRY_SCHEDULED')
            AND "nextAttemptAt" <= ${input.now}
          )
          OR (
            status = 'RUNNING'
            AND EXISTS (
              SELECT 1
              FROM "JobAttempt"
              WHERE "jobId" = "Job".id
                AND status = 'RUNNING'
                AND "leaseExpiresAt" <= ${input.now}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM "JobAttempt"
              WHERE "jobId" = "Job".id
                AND status = 'RUNNING'
                AND "leaseExpiresAt" > ${input.now}
            )
          )
        )
      ORDER BY priority DESC, "nextAttemptAt" ASC, "createdAt" ASC
      FOR UPDATE OF "Job" SKIP LOCKED
      LIMIT 1
    `);
    const jobId = rows[0]?.id;
    if (!jobId) return null;
    const job = await transaction.job.findUniqueOrThrow({
      where: { id: jobId },
    });
    const definition = definitionForJobKind(job.kind as JobKind);
    const previousAttempts = await transaction.jobAttempt.count({
      where: { jobId },
    });
    if (job.status === JobStatus.RUNNING) {
      await transaction.jobAttempt.updateMany({
        where: {
          jobId,
          status: JobAttemptStatus.RUNNING,
          leaseExpiresAt: { lte: input.now },
        },
        data: {
          status: JobAttemptStatus.UNKNOWN_OUTCOME,
          failureClass: JobFailureClass.UNKNOWN_OUTCOME,
          errorEvidence: { reason: "LEASE_EXPIRED" },
          completedAt: input.now,
        },
      });
      const reconciliationRequired =
        definition.sideEffectPolicy ===
        JobSideEffectPolicy.RECONCILIATION_REQUIRED;
      const retryDisabled = definition.retryPolicy === JobRetryPolicy.NEVER;
      if (
        reconciliationRequired ||
        retryDisabled ||
        previousAttempts >= definition.maxAttempts
      ) {
        await transaction.job.update({
          where: { id: jobId },
          data: {
            status: JobStatus.FAILED,
            errorCode: reconciliationRequired
              ? JobRuntimeErrorCode.RECONCILIATION_REQUIRED
              : JobRuntimeErrorCode.LEASE_EXPIRED,
            completedAt: input.now,
          },
        });
        return null;
      }
    }
    const tokenRows = await transaction.$queryRaw<
      Array<{ value: bigint }>
    >(Prisma.sql`
      SELECT nextval('job_fencing_token_seq')::bigint AS value
    `);
    const fencingToken = tokenRows[0]?.value;
    if (fencingToken === undefined)
      throw new Error("JOB_FENCING_SEQUENCE_UNAVAILABLE");
    const attempt = await transaction.jobAttempt.create({
      data: {
        jobId,
        attemptNumber: previousAttempts + 1,
        handlerVersion: definition.handlerVersion,
        checkpointSchemaVersion: definition.checkpointSchemaVersion,
        leaseOwner: input.leaseOwner,
        leaseToken: input.leaseToken,
        leaseExpiresAt: input.leaseExpiresAt,
        heartbeatAt: input.now,
        fencingToken,
      },
    });
    await transaction.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.RUNNING,
        startedAt: job.startedAt ?? input.now,
        errorCode: null,
      },
    });
    const latest = await transaction.jobCheckpoint.findFirst({
      where: {
        jobId,
        handlerVersion: definition.handlerVersion,
        checkpointSchemaVersion: definition.checkpointSchemaVersion,
        inputHash: job.inputHash,
      },
      orderBy: { sequence: "desc" },
    });
    return {
      jobId,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      kind: job.kind as JobKind,
      inputRef: job.inputRef as Readonly<Record<string, unknown>>,
      inputHash: job.inputHash,
      handlerVersion: attempt.handlerVersion,
      checkpointSchemaVersion: attempt.checkpointSchemaVersion,
      fencingToken: attempt.fencingToken,
      leaseToken: attempt.leaseToken,
      leaseExpiresAt: attempt.leaseExpiresAt,
      checkpoint: latest
        ? openCheckpoint(checkpointKey, latest, job.inputHash)
        : null,
    };
  });
}

async function heartbeat(
  database: SylisDatabase,
  attempt: ClaimedAttempt,
  now: Date,
  leaseExpiresAt: Date,
): Promise<boolean> {
  return database.$transaction(async (transaction) => {
    await lockJob(transaction, attempt.jobId);
    if (!(await ownsLease(transaction, attempt, now))) return false;
    const result = await transaction.jobAttempt.updateMany({
      where: activeLease(attempt, now),
      data: { heartbeatAt: now, leaseExpiresAt },
    });
    return result.count === 1;
  });
}

async function checkpoint(
  database: SylisDatabase,
  key: Buffer,
  attempt: ClaimedAttempt,
  value: Readonly<Record<string, unknown>>,
  now: Date,
): Promise<boolean> {
  return database.$transaction(async (transaction) => {
    await lockJob(transaction, attempt.jobId);
    if (!(await ownsLease(transaction, attempt, now))) return false;
    const sequence = await nextSequence(
      transaction,
      "JobCheckpoint",
      attempt.jobId,
    );
    const stateHash = digest(value);
    await transaction.jobCheckpoint.create({
      data: {
        jobId: attempt.jobId,
        attemptId: attempt.attemptId,
        sequence,
        handlerVersion: attempt.handlerVersion,
        checkpointSchemaVersion: attempt.checkpointSchemaVersion,
        inputHash: attempt.inputHash,
        stateCiphertext: sealCheckpoint(key, value, attempt, sequence),
        stateHash,
      },
    });
    return true;
  });
}

async function progress(
  database: SylisDatabase,
  attempt: ClaimedAttempt,
  value: Parameters<JobStore["progress"]>[1],
  now: Date,
): Promise<boolean> {
  const event = validateProgressInput(value);
  return database.$transaction(async (transaction) => {
    await lockJob(transaction, attempt.jobId);
    if (!(await ownsLease(transaction, attempt, now))) return false;
    const processed = BigInt(event.processed);
    const previous = await transaction.jobProgressEvent.findFirst({
      where: {
        jobId: attempt.jobId,
        attemptId: attempt.attemptId,
        stage: event.stage,
      },
      orderBy: { sequence: "desc" },
      select: { processed: true },
    });
    if (previous && processed < previous.processed) {
      throw new Error(JobProgressErrorCode.REGRESSION);
    }
    const sequence = await nextSequence(
      transaction,
      "JobProgressEvent",
      attempt.jobId,
    );
    await transaction.jobProgressEvent.create({
      data: {
        jobId: attempt.jobId,
        attemptId: attempt.attemptId,
        sequence,
        eventType: event.type ?? JobEventType.PROGRESS,
        stage: event.stage,
        processed,
        total: event.total === null ? null : BigInt(event.total),
        ratePerSecond: event.ratePerSecond,
        etaSeconds: event.etaSeconds,
        etaReliability: event.etaReliability,
        warningCode: event.warningCode,
        message: event.message,
        tokens:
          event.tokens === null || event.tokens === undefined
            ? null
            : BigInt(event.tokens),
        costMicros:
          event.costMicros === null || event.costMicros === undefined
            ? null
            : BigInt(event.costMicros),
        occurredAt: now,
      },
    });
    return true;
  });
}

async function cancellationRequested(
  database: SylisDatabase,
  attempt: ClaimedAttempt,
): Promise<boolean | null> {
  const row = await database.jobAttempt.findFirst({
    where: activeLease(attempt, new Date()),
    select: { job: { select: { cancelRequestedAt: true } } },
  });
  return row ? row.job.cancelRequestedAt !== null : null;
}

async function finish(
  database: SylisDatabase,
  attempt: ClaimedAttempt,
  value: Parameters<JobStore["finish"]>[1],
  now: Date,
): Promise<boolean> {
  const result = validateResultRef(value);
  return database.$transaction(async (transaction) => {
    await lockJob(transaction, attempt.jobId);
    if (!(await ownsLease(transaction, attempt, now))) return false;
    const job = await transaction.job.findUniqueOrThrow({
      where: { id: attempt.jobId },
      select: {
        kind: true,
        ownerType: true,
        ownerId: true,
        status: true,
        cancelRequestedAt: true,
      },
    });
    if (job.status !== JobStatus.RUNNING) return false;
    const cancelled = job.cancelRequestedAt !== null;
    await transaction.jobAttempt.update({
      where: { id: attempt.attemptId },
      data: {
        status: cancelled
          ? JobAttemptStatus.CANCELLED
          : JobAttemptStatus.SUCCEEDED,
        ...(cancelled
          ? {
              failureClass: JobFailureClass.CANCELLED,
              errorEvidence: {},
            }
          : {}),
        completedAt: now,
      },
    });
    await transaction.job.update({
      where: { id: attempt.jobId },
      data: {
        status: cancelled ? JobStatus.CANCELLED : JobStatus.SUCCEEDED,
        resultRef: cancelled ? Prisma.DbNull : resultJson(result),
        completedAt: now,
        errorCode: cancelled ? JobCancellationErrorCode.REQUESTED : null,
      },
    });
    await appendTerminalProgress(
      transaction,
      attempt,
      now,
      cancelled ? JobEventType.CANCELLED : JobEventType.COMPLETED,
      cancelled
        ? JobTerminalProgressStage.CANCELLED
        : JobTerminalProgressStage.COMPLETED,
      cancelled ? JobCancellationErrorCode.REQUESTED : undefined,
    );
    await transitionAgentRunToWaiting(transaction, job, now);
    return true;
  });
}

async function fail(
  database: SylisDatabase,
  attempt: ClaimedAttempt,
  failure: JobFailure,
  now: Date,
): Promise<boolean> {
  return database.$transaction(async (transaction) => {
    await lockJob(transaction, attempt.jobId);
    if (!(await ownsLease(transaction, attempt, now))) return false;
    const job = await transaction.job.findUniqueOrThrow({
      where: { id: attempt.jobId },
      select: {
        kind: true,
        ownerType: true,
        ownerId: true,
        status: true,
        cancelRequestedAt: true,
      },
    });
    if (job.status !== JobStatus.RUNNING) return false;
    const resolvedFailure: JobFailure =
      job.cancelRequestedAt === null
        ? failure
        : {
            failureClass: JobFailureClass.CANCELLED,
            errorCode: JobCancellationErrorCode.REQUESTED,
          };
    const definition = definitionForJobKind(attempt.kind);
    const retry =
      definition.retryPolicy === JobRetryPolicy.TRANSIENT_ONLY &&
      resolvedFailure.failureClass === JobFailureClass.TRANSIENT &&
      attempt.attemptNumber < definition.maxAttempts;
    const cancelled =
      resolvedFailure.failureClass === JobFailureClass.CANCELLED;
    await transaction.jobAttempt.update({
      where: { id: attempt.attemptId },
      data: {
        status: cancelled
          ? JobAttemptStatus.CANCELLED
          : failure.failureClass === JobFailureClass.UNKNOWN_OUTCOME
            ? JobAttemptStatus.UNKNOWN_OUTCOME
            : JobAttemptStatus.FAILED,
        failureClass: resolvedFailure.failureClass,
        errorEvidence: (resolvedFailure.evidence ??
          {}) as PrismaTypes.InputJsonValue,
        completedAt: now,
      },
    });
    await transaction.job.update({
      where: { id: attempt.jobId },
      data: retry
        ? {
            status: JobStatus.RETRY_SCHEDULED,
            nextAttemptAt: new Date(
              now.getTime() + retryDelay(attempt.attemptNumber),
            ),
            errorCode: resolvedFailure.errorCode,
          }
        : {
            status: cancelled ? JobStatus.CANCELLED : JobStatus.FAILED,
            completedAt: now,
            errorCode: resolvedFailure.errorCode,
          },
    });
    await appendTerminalProgress(
      transaction,
      attempt,
      now,
      cancelled ? JobEventType.CANCELLED : JobEventType.FAILED,
      retry
        ? JobTerminalProgressStage.RETRY_SCHEDULED
        : cancelled
          ? JobTerminalProgressStage.CANCELLED
          : JobTerminalProgressStage.FAILED,
      resolvedFailure.errorCode,
    );
    if (!retry) {
      await transitionAgentRunToWaiting(transaction, job, now);
    }
    return true;
  });
}

async function transitionAgentRunToWaiting(
  transaction: SylisTransaction,
  job: {
    kind: DatabaseJobKind;
    ownerType: JobOwnerType;
    ownerId: string;
  },
  now: Date,
): Promise<void> {
  if (
    job.ownerType !== JobOwnerType.AGENT_RUN ||
    (job.kind !== DatabaseJobKind.AGENT_RUN_ACTIVATION &&
      job.kind !== DatabaseJobKind.AGENT_TOOL_CONTINUATION)
  ) {
    return;
  }
  const activeWaits = await transaction.agentWaitCondition.count({
    where: { runId: job.ownerId, status: AgentWaitStatus.ACTIVE },
  });
  if (activeWaits === 0) return;
  if (activeWaits !== 1) throw new Error("AGENT_ACTIVE_WAIT_COUNT_INVALID");
  const transitioned = await transaction.agentRun.updateMany({
    where: { id: job.ownerId, status: AgentRunStatus.RUNNING },
    data: { status: AgentRunStatus.WAITING, waitedAt: now },
  });
  if (transitioned.count !== 1) {
    throw new Error("AGENT_WAITING_TRANSITION_INVALID");
  }
}

function activeLease(attempt: ClaimedAttempt, now: Date) {
  return {
    id: attempt.attemptId,
    jobId: attempt.jobId,
    leaseToken: attempt.leaseToken,
    fencingToken: attempt.fencingToken,
    status: JobAttemptStatus.RUNNING,
    leaseExpiresAt: { gt: now },
  };
}

async function ownsLease(
  transaction: SylisTransaction,
  attempt: ClaimedAttempt,
  now: Date,
): Promise<boolean> {
  const current = await transaction.jobAttempt.findFirst({
    where: { jobId: attempt.jobId },
    orderBy: { fencingToken: "desc" },
    select: {
      id: true,
      leaseToken: true,
      fencingToken: true,
      status: true,
      leaseExpiresAt: true,
    },
  });
  return (
    current?.id === attempt.attemptId &&
    current.leaseToken === attempt.leaseToken &&
    current.fencingToken === attempt.fencingToken &&
    current.status === JobAttemptStatus.RUNNING &&
    current.leaseExpiresAt > now
  );
}

async function lockJob(
  transaction: SylisTransaction,
  jobId: string,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT id FROM "Job" WHERE id = ${jobId}::uuid FOR UPDATE`,
  );
}

async function nextSequence(
  transaction: SylisTransaction,
  table: "JobCheckpoint" | "JobProgressEvent",
  jobId: string,
): Promise<number> {
  const rows = await transaction.$queryRaw<Array<{ next: number }>>(
    Prisma.raw(
      `SELECT COALESCE(MAX(sequence), 0)::int + 1 AS next FROM "${table}" WHERE "jobId" = '${jobId.replaceAll("'", "''")}'::uuid`,
    ),
  );
  return rows[0]?.next ?? 1;
}

async function appendTerminalProgress(
  transaction: SylisTransaction,
  attempt: ClaimedAttempt,
  now: Date,
  eventType:
    | JobEventType.COMPLETED
    | JobEventType.FAILED
    | JobEventType.CANCELLED,
  stage: JobTerminalProgressStage,
  message?: string,
): Promise<void> {
  await lockJob(transaction, attempt.jobId);
  const latest = await transaction.jobProgressEvent.findFirst({
    where: { jobId: attempt.jobId, attemptId: attempt.attemptId },
    orderBy: { sequence: "desc" },
    select: { processed: true, total: true },
  });
  const sequence = await nextSequence(
    transaction,
    "JobProgressEvent",
    attempt.jobId,
  );
  await transaction.jobProgressEvent.create({
    data: {
      jobId: attempt.jobId,
      attemptId: attempt.attemptId,
      sequence,
      eventType,
      stage,
      processed: latest?.processed ?? 0n,
      total: latest?.total ?? null,
      etaReliability: JobProgressEtaReliability.HIGH,
      message,
      occurredAt: now,
    },
  });
}

function sealCheckpoint(
  key: Buffer,
  value: Readonly<Record<string, unknown>>,
  attempt: ClaimedAttempt,
  sequence: number,
): Uint8Array<ArrayBuffer> {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(checkpointAad(attempt.jobId, attempt.inputHash, sequence));
  const ciphertext = Buffer.concat([
    cipher.update(canonicalJson(value), "utf8"),
    cipher.final(),
  ]);
  return Uint8Array.from(
    Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]),
  );
}

function openCheckpoint(
  key: Buffer,
  checkpoint: {
    jobId: string;
    sequence: number;
    handlerVersion: string;
    checkpointSchemaVersion: string;
    inputHash: string;
    stateHash: string;
    stateCiphertext: Uint8Array<ArrayBuffer> | null;
    createdAt: Date;
  },
  inputHash: string,
): JobCheckpointEnvelope {
  if (!checkpoint.stateCiphertext || checkpoint.inputHash !== inputHash) {
    throw new Error("JOB_CHECKPOINT_UNREADABLE");
  }
  const sealed = Buffer.from(checkpoint.stateCiphertext);
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  decipher.setAAD(
    checkpointAad(checkpoint.jobId, inputHash, checkpoint.sequence),
  );
  const plaintext = Buffer.concat([
    decipher.update(sealed.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
  const state = JSON.parse(plaintext) as Record<string, unknown>;
  if (digest(state) !== checkpoint.stateHash)
    throw new Error("JOB_CHECKPOINT_HASH_MISMATCH");
  return {
    jobId: checkpoint.jobId,
    sequence: checkpoint.sequence,
    handlerVersion: checkpoint.handlerVersion,
    schemaVersion: checkpoint.checkpointSchemaVersion,
    inputHash: checkpoint.inputHash,
    stateHash: checkpoint.stateHash,
    state,
    createdAt: checkpoint.createdAt.toISOString(),
  };
}

function checkpointAad(
  jobId: string,
  inputHash: string,
  sequence: number,
): Buffer {
  return Buffer.from(canonicalJson({ jobId, inputHash, sequence }));
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function resultJson(
  result: ReturnType<typeof validateResultRef>,
): PrismaTypes.InputJsonObject {
  return {
    resultType: result.resultType,
    ...(result.resultId === undefined ? {} : { resultId: result.resultId }),
    ...(result.uri === undefined ? {} : { uri: result.uri }),
    ...(result.contentHash === undefined
      ? {}
      : { contentHash: result.contentHash }),
    ...(result.summary === undefined ? {} : { summary: { ...result.summary } }),
  };
}

function retryDelay(attemptNumber: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attemptNumber - 1));
}
