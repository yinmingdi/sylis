import {
  isRetryableJobError,
  type JobProgressInput,
} from "@sylis/background-jobs";
import { Prisma, type PrismaTypes, type SylisDatabase } from "@sylis/database";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

export interface ClaimedImporterJob {
  id: string;
  kind: "LEXICON_IMPORT" | "LEXICON_VALIDATE";
  inputHash: string;
  attempt: number;
  maxAttempts: number;
  leaseToken: string;
}

export class ImporterJobRuntime {
  constructor(
    private readonly database: SylisDatabase,
    private readonly instanceId: string,
    private readonly leaseDurationMs: number,
    private readonly checkpointKey: Buffer,
  ) {}

  async latestCheckpoint<T extends Record<string, unknown>>(
    job: ClaimedImporterJob,
    handlerVersion: string,
    schemaVersion: string,
  ): Promise<T | null> {
    const checkpoint = await this.database.jobCheckpoint.findFirst({
      where: { jobId: job.id },
      orderBy: { sequence: "desc" },
    });
    if (!checkpoint) return null;
    if (
      checkpoint.inputHash !== job.inputHash ||
      checkpoint.handlerVersion !== handlerVersion ||
      checkpoint.checkpointSchemaVersion !== schemaVersion
    ) {
      throw new Error("JOB_CHECKPOINT_INCOMPATIBLE");
    }
    const envelope = Buffer.from(checkpoint.stateCiphertext);
    if (envelope.length < 29) throw new Error("JOB_CHECKPOINT_INVALID");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.checkpointKey,
      envelope.subarray(0, 12),
    );
    decipher.setAuthTag(envelope.subarray(12, 28));
    const plaintext = Buffer.concat([
      decipher.update(envelope.subarray(28)),
      decipher.final(),
    ]);
    const stateHash = `sha256:${createHash("sha256").update(plaintext).digest("hex")}`;
    if (stateHash !== checkpoint.stateHash) {
      throw new Error("JOB_CHECKPOINT_HASH_MISMATCH");
    }
    return JSON.parse(plaintext.toString("utf8")) as T;
  }

  async checkpoint(
    job: ClaimedImporterJob,
    handlerVersion: string,
    schemaVersion: string,
    state: Record<string, unknown>,
  ): Promise<void> {
    const plaintext = Buffer.from(JSON.stringify(state));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.checkpointKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const envelope = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    const stateHash = `sha256:${createHash("sha256").update(plaintext).digest("hex")}`;
    await this.database.$transaction(async (transaction) => {
      const current = await transaction.backgroundJob.findFirst({
        where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
        select: { id: true },
      });
      if (!current) throw new Error("JOB_LEASE_LOST");
      const last = await transaction.jobCheckpoint.findFirst({
        where: { jobId: job.id },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      await transaction.jobCheckpoint.create({
        data: {
          jobId: job.id,
          sequence: (last?.sequence ?? 0) + 1,
          handlerVersion,
          checkpointSchemaVersion: schemaVersion,
          inputHash: job.inputHash,
          stateCiphertext: envelope,
          stateHash,
        },
      });
    });
  }

  async claim(): Promise<ClaimedImporterJob | null> {
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<Omit<ClaimedImporterJob, "leaseToken">>
      >(Prisma.sql`
        SELECT id, kind, "inputHash", attempt, "maxAttempts"
        FROM "BackgroundJob"
        WHERE executor = 'IMPORTER_RUNNER'::"JobExecutor"
          AND kind IN ('LEXICON_IMPORT'::"JobKind", 'LEXICON_VALIDATE'::"JobKind")
          AND status IN ('QUEUED'::"JobStatus", 'RETRY_SCHEDULED'::"JobStatus", 'RUNNING'::"JobStatus")
          AND "nextAttemptAt" <= now()
          AND "cancelRequestedAt" IS NULL
          AND (status <> 'RUNNING'::"JobStatus" OR "leaseExpiresAt" < now())
        ORDER BY priority DESC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const candidate = rows[0];
      if (!candidate) return null;
      const leaseToken = randomUUID();
      const updated = await transaction.backgroundJob.update({
        where: { id: candidate.id },
        data: {
          status: "RUNNING",
          leaseOwner: this.instanceId,
          leaseToken,
          leaseExpiresAt: new Date(Date.now() + this.leaseDurationMs),
          heartbeatAt: new Date(),
          attempt: { increment: 1 },
          startedAt: candidate.attempt === 0 ? new Date() : undefined,
        },
      });
      await this.appendProgress(transaction, updated.id, {
        type: "job.started",
        stage: "CLAIMED",
        processed: 0,
        total: null,
      });
      return {
        id: updated.id,
        kind: updated.kind as ClaimedImporterJob["kind"],
        inputHash: updated.inputHash,
        attempt: updated.attempt,
        maxAttempts: updated.maxAttempts,
        leaseToken,
      };
    });
  }

  async heartbeat(job: ClaimedImporterJob): Promise<void> {
    const updated = await this.database.backgroundJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
      data: {
        heartbeatAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + this.leaseDurationMs),
      },
    });
    if (updated.count !== 1) throw new Error("JOB_LEASE_LOST");
  }

  async report(
    job: ClaimedImporterJob,
    event: JobProgressInput,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await this.assertLease(transaction, job);
      await this.appendProgress(transaction, job.id, event);
    });
  }

  async succeed(job: ClaimedImporterJob): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await this.assertLease(transaction, job);
      await this.appendProgress(transaction, job.id, {
        type: "job.completed",
        stage: "TERMINAL",
        processed: 1,
        total: 1,
      });
      await transaction.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          heartbeatAt: new Date(),
        },
      });
    });
  }

  async cancellationRequested(job: ClaimedImporterJob): Promise<boolean> {
    const current = await this.database.backgroundJob.findUnique({
      where: { id: job.id },
      select: { cancelRequestedAt: true, leaseToken: true },
    });
    if (!current || current.leaseToken !== job.leaseToken) {
      throw new Error("JOB_LEASE_LOST");
    }
    return current.cancelRequestedAt !== null;
  }

  async fail(job: ClaimedImporterJob, error: unknown): Promise<void> {
    const errorCode =
      error instanceof Error ? error.message.slice(0, 128) : "UNKNOWN";
    const cancelled = errorCode === "JOB_CANCELLED";
    const retryable =
      !cancelled && job.attempt < job.maxAttempts && isRetryableJobError(error);
    await this.database.$transaction(async (transaction) => {
      await this.assertLease(transaction, job);
      await this.appendProgress(transaction, job.id, {
        type: cancelled
          ? "job.cancelled"
          : retryable
            ? "job.warning"
            : "job.failed",
        stage: retryable ? "RETRY_SCHEDULED" : "TERMINAL",
        processed: retryable ? 0 : 1,
        total: retryable ? null : 1,
        message: errorCode,
      });
      await transaction.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: cancelled
            ? "CANCELLED"
            : retryable
              ? "RETRY_SCHEDULED"
              : "FAILED",
          errorCode,
          nextAttemptAt: retryable
            ? new Date(Date.now() + Math.min(300_000, 1_000 * 2 ** job.attempt))
            : undefined,
          completedAt: retryable ? null : new Date(),
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
    });
  }

  private async assertLease(
    transaction: PrismaTypes.TransactionClient,
    job: ClaimedImporterJob,
  ): Promise<void> {
    const current = await transaction.backgroundJob.findFirst({
      where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
      select: { id: true },
    });
    if (!current) throw new Error("JOB_LEASE_LOST");
  }

  private async appendProgress(
    transaction: PrismaTypes.TransactionClient,
    jobId: string,
    event: JobProgressInput,
  ): Promise<void> {
    const last = await transaction.jobProgressEvent.findFirst({
      where: { jobId },
      orderBy: { sequence: "desc" },
    });
    if (
      last?.stage === event.stage &&
      BigInt(event.processed) < last.processed
    ) {
      throw new Error("JOB_PROGRESS_REGRESSION");
    }
    await transaction.jobProgressEvent.create({
      data: {
        jobId,
        sequence: (last?.sequence ?? 0) + 1,
        eventType: event.type ?? "job.progress",
        stage: event.stage,
        processed: event.processed,
        total: event.total,
        ratePerSecond: event.ratePerSecond,
        etaSeconds: event.etaSeconds,
        warningCode: event.warningCode,
        message: event.message,
      },
    });
  }
}
