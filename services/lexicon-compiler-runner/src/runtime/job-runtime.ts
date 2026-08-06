import {
  isRetryableJobError,
  type JobProgressInput,
} from "@sylis/background-jobs";
import { Prisma, type PrismaTypes, type SylisDatabase } from "@sylis/database";
import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

export interface ClaimedBuildJob {
  id: string;
  inputHash: string;
  attempt: number;
  maxAttempts: number;
  leaseToken: string;
  cancelRequestedAt: Date | null;
}

export class CompilerJobRuntime {
  constructor(
    private readonly database: SylisDatabase,
    private readonly instanceId: string,
    private readonly leaseDurationMs: number,
    private readonly checkpointKey: Buffer,
  ) {}

  async claim(): Promise<ClaimedBuildJob | null> {
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<Omit<ClaimedBuildJob, "leaseToken">>
      >(Prisma.sql`
        SELECT id, "inputHash", attempt, "maxAttempts", "cancelRequestedAt"
        FROM "BackgroundJob"
        WHERE executor = 'COMPILER_RUNNER'::"JobExecutor"
          AND kind = 'LEXICON_BUILD'::"JobKind"
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
      const leaseExpiresAt = new Date(Date.now() + this.leaseDurationMs);
      const updated = await transaction.backgroundJob.update({
        where: { id: candidate.id },
        data: {
          status: "RUNNING",
          leaseOwner: this.instanceId,
          leaseToken,
          leaseExpiresAt,
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
        inputHash: updated.inputHash,
        attempt: updated.attempt,
        maxAttempts: updated.maxAttempts,
        leaseToken,
        cancelRequestedAt: updated.cancelRequestedAt,
      };
    });
  }

  async heartbeat(job: ClaimedBuildJob): Promise<void> {
    const updated = await this.database.backgroundJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
      data: {
        heartbeatAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + this.leaseDurationMs),
      },
    });
    if (updated.count !== 1) throw new Error("JOB_LEASE_LOST");
  }

  async report(job: ClaimedBuildJob, event: JobProgressInput): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await this.assertLease(transaction, job);
      await this.appendProgress(transaction, job.id, event);
    });
  }

  async checkpoint(
    job: ClaimedBuildJob,
    handlerVersion: string,
    schemaVersion: string,
    state: unknown,
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
      await this.assertLease(transaction, job);
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

  async cancellationRequested(job: ClaimedBuildJob): Promise<boolean> {
    const current = await this.database.backgroundJob.findUnique({
      where: { id: job.id },
      select: { cancelRequestedAt: true, leaseToken: true },
    });
    if (!current || current.leaseToken !== job.leaseToken) {
      throw new Error("JOB_LEASE_LOST");
    }
    return current.cancelRequestedAt !== null;
  }

  async succeed(
    job: ClaimedBuildJob,
    result: {
      artifactUri: string;
      artifactHash: string;
      compilerRunId: string;
    },
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await this.assertLease(transaction, job);
      await transaction.buildRun.update({
        where: { jobId: job.id },
        data: result,
      });
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

  async fail(job: ClaimedBuildJob, error: unknown): Promise<void> {
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
    job: ClaimedBuildJob,
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
