import { Inject, Injectable } from "@nestjs/common";
import {
  isRetryableJobError,
  JOB_KIND_REGISTRY,
  type JobKind,
  type JobProgressInput,
} from "@sylis/background-jobs";
import { Prisma, type PrismaTypes, type SylisDatabase } from "@sylis/database";
import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { WORKER_DATABASE } from "../adapters/database/database.module";
import { WorkerConfig } from "../config/worker-config";

export interface ClaimedWorkerJob {
  id: string;
  kind: Exclude<
    JobKind,
    "LEXICON_BUILD" | "LEXICON_IMPORT" | "LEXICON_VALIDATE"
  >;
  inputHash: string;
  requestRefId: string;
  requestedByUserId: string | null;
  subjectUserId: string | null;
  attempt: number;
  maxAttempts: number;
  leaseToken: string;
}

@Injectable()
export class JobRuntimeService {
  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
    private readonly config: WorkerConfig,
  ) {}

  async claim(): Promise<ClaimedWorkerJob | null> {
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<Omit<ClaimedWorkerJob, "leaseToken">>
      >(Prisma.sql`
        SELECT id, kind, "inputHash", "requestRefId", "requestedByUserId",
               "subjectUserId", attempt, "maxAttempts"
        FROM "BackgroundJob"
        WHERE executor = 'WORKER'::"JobExecutor"
          AND status IN ('QUEUED'::"JobStatus", 'RETRY_SCHEDULED'::"JobStatus", 'RUNNING'::"JobStatus")
          AND "nextAttemptAt" <= now()
          AND "cancelRequestedAt" IS NULL
          AND (status <> 'RUNNING'::"JobStatus" OR "leaseExpiresAt" < now())
        ORDER BY priority DESC, "createdAt"
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
          leaseOwner: this.config.instanceId,
          leaseToken,
          leaseExpiresAt: new Date(Date.now() + this.config.leaseDurationMs),
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
      return { ...candidate, attempt: updated.attempt, leaseToken };
    });
  }

  async heartbeat(job: ClaimedWorkerJob): Promise<void> {
    const result = await this.database.backgroundJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
      data: {
        heartbeatAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + this.config.leaseDurationMs),
      },
    });
    if (result.count !== 1) throw new Error("JOB_LEASE_LOST");
  }

  async withHeartbeat<T>(
    job: ClaimedWorkerJob,
    operation: () => Promise<T>,
  ): Promise<T> {
    let heartbeatInFlight = false;
    const intervalMs = Math.max(
      1_000,
      Math.min(10_000, Math.floor(this.config.leaseDurationMs / 3)),
    );
    const pulse = async (): Promise<void> => {
      if (heartbeatInFlight) return;
      heartbeatInFlight = true;
      try {
        await this.heartbeat(job);
      } catch {
        // The awaited heartbeat below is the authoritative lease check.
      } finally {
        heartbeatInFlight = false;
      }
    };
    await this.heartbeat(job);
    const timer = setInterval(() => void pulse(), intervalMs);
    try {
      const result = await operation();
      await this.heartbeat(job);
      return result;
    } finally {
      clearInterval(timer);
    }
  }

  async report(job: ClaimedWorkerJob, event: JobProgressInput): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await this.assertLease(transaction, job);
      await this.appendProgress(transaction, job.id, event);
    });
  }

  async checkpoint(
    job: ClaimedWorkerJob,
    state: Record<string, unknown>,
  ): Promise<void> {
    const definition = JOB_KIND_REGISTRY[job.kind];
    const plaintext = Buffer.from(JSON.stringify(state));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.config.checkpointKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const envelope = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
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
          handlerVersion: definition.handlerVersion,
          checkpointSchemaVersion: definition.checkpointSchemaVersion,
          inputHash: job.inputHash,
          stateCiphertext: envelope,
          stateHash: `sha256:${createHash("sha256").update(plaintext).digest("hex")}`,
        },
      });
    });
  }

  async cancellationRequested(job: ClaimedWorkerJob): Promise<boolean> {
    const row = await this.database.backgroundJob.findUnique({
      where: { id: job.id },
      select: { leaseToken: true, cancelRequestedAt: true },
    });
    if (row?.leaseToken !== job.leaseToken) throw new Error("JOB_LEASE_LOST");
    return row.cancelRequestedAt !== null;
  }

  async succeed(job: ClaimedWorkerJob): Promise<void> {
    await this.finish(job, "SUCCEEDED", "job.completed");
  }

  async fail(job: ClaimedWorkerJob, error: unknown): Promise<void> {
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

  private async finish(
    job: ClaimedWorkerJob,
    status: "SUCCEEDED",
    type: "job.completed",
  ) {
    await this.database.$transaction(async (transaction) => {
      await this.assertLease(transaction, job);
      await this.appendProgress(transaction, job.id, {
        type,
        stage: "TERMINAL",
        processed: 1,
        total: 1,
      });
      await transaction.backgroundJob.update({
        where: { id: job.id },
        data: {
          status,
          completedAt: new Date(),
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          heartbeatAt: new Date(),
        },
      });
    });
  }

  private async assertLease(
    transaction: PrismaTypes.TransactionClient,
    job: ClaimedWorkerJob,
  ) {
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
  ) {
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
