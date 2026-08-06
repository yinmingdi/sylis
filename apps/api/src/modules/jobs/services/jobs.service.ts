import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  JOB_KIND_REGISTRY,
  type JobKind,
  type JobProgressEvent as ContractProgressEvent,
} from "@sylis/background-jobs";
import {
  Prisma,
  type SessionAudience,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";

export interface CreateJobInput {
  id?: string;
  kind: JobKind;
  requestRefId: string;
  inputHash: string;
  idempotencyKey: string;
  requestedByUserId?: string;
  subjectUserId?: string;
  audience: SessionAudience;
  priority?: number;
}

@Injectable()
export class JobsService {
  constructor(@Inject(DATABASE) private readonly database: SylisDatabase) {}

  async create(transaction: SylisTransaction, input: CreateJobInput) {
    if (!input.idempotencyKey?.trim()) {
      throw new ConflictException("Idempotency-Key header is required");
    }
    const definition = JOB_KIND_REGISTRY[input.kind];
    await transaction.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`job-idempotency:${input.requestedByUserId ?? "system"}:${input.kind}:${input.idempotencyKey}`},
          0
        )
      )
    `);
    const existing = await transaction.backgroundJob.findFirst({
      where: {
        requestedByUserId: input.requestedByUserId ?? null,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (existing) {
      if (existing.inputHash !== input.inputHash) {
        throw new ConflictException(
          "Idempotency key reused with different input",
        );
      }
      return existing;
    }
    const job = await transaction.backgroundJob.create({
      data: {
        id: input.id ?? randomUUID(),
        kind: input.kind,
        executor: definition.executor,
        requestedByUserId: input.requestedByUserId,
        subjectUserId: input.subjectUserId,
        audience: input.audience,
        requestRefId: input.requestRefId,
        inputHash: input.inputHash,
        idempotencyKey: input.idempotencyKey,
        priority: input.priority ?? 0,
        maxAttempts: definition.maxAttempts,
      },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: "BackgroundJob",
        aggregateId: job.id,
        eventType: "job.available",
        eventVersion: "sylis.job-available/1",
        payload: { jobId: job.id, kind: job.kind },
      },
    });
    return job;
  }

  async get(actor: ActorContext, jobId: string) {
    const job = await this.database.backgroundJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        kind: true,
        status: true,
        attempt: true,
        maxAttempts: true,
        cancelRequestedAt: true,
        pauseReasonCode: true,
        errorCode: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        requestedByUserId: true,
        subjectUserId: true,
        audience: true,
      },
    });
    if (!job) throw new NotFoundException();
    this.assertVisible(actor, job);
    return job;
  }

  async cancel(actor: ActorContext, jobId: string) {
    await this.get(actor, jobId);
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{ status: string; cancelRequestedAt: Date | null }>
      >(Prisma.sql`
        SELECT status, "cancelRequestedAt"
        FROM "BackgroundJob"
        WHERE id = ${jobId}::uuid
        FOR UPDATE
      `);
      const current = rows[0];
      if (!current) throw new NotFoundException();
      if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(current.status)) {
        throw new ConflictException("Terminal jobs cannot be cancelled");
      }
      return transaction.backgroundJob.update({
        where: { id: jobId },
        data: ["QUEUED", "RETRY_SCHEDULED", "PAUSED"].includes(current.status)
          ? {
              status: "CANCELLED",
              cancelRequestedAt: new Date(),
              completedAt: new Date(),
            }
          : { cancelRequestedAt: new Date() },
      });
    });
  }

  async resume(actor: ActorContext, jobId: string, reason: string) {
    if (actor.audience !== "ADMIN") throw new ForbiddenException();
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{
          status: string;
          attempt: number;
          maxAttempts: number;
        }>
      >(Prisma.sql`
        SELECT status, attempt, "maxAttempts"
        FROM "BackgroundJob"
        WHERE id = ${jobId}::uuid
        FOR UPDATE
      `);
      const current = rows[0];
      if (!current) throw new NotFoundException();
      if (!["FAILED", "PAUSED"].includes(current.status)) {
        throw new ConflictException(
          "Only failed or paused jobs can be resumed",
        );
      }
      const job = await transaction.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "QUEUED",
          maxAttempts: Math.max(current.maxAttempts, current.attempt + 1),
          nextAttemptAt: new Date(),
          cancelRequestedAt: null,
          pauseReasonCode: null,
          errorCode: null,
          completedAt: null,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: "BackgroundJob",
          aggregateId: job.id,
          eventType: "job.available",
          eventVersion: "sylis.job-available/1",
          payload: { jobId: job.id, kind: job.kind, resumed: true },
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          eventType: "job.resumed",
          subjectType: "BackgroundJob",
          subjectId: job.id,
          outcome: "SUCCEEDED",
          metadata: { reason, previousStatus: current.status },
        },
      });
      return job;
    });
  }

  async events(
    actor: ActorContext,
    jobId: string,
    afterSequence: number,
  ): Promise<ContractProgressEvent[]> {
    await this.get(actor, jobId);
    const events = await this.database.jobProgressEvent.findMany({
      where: { jobId, sequence: { gt: afterSequence } },
      orderBy: { sequence: "asc" },
      take: 100,
    });
    return events.map((event) => ({
      jobId: event.jobId,
      sequence: event.sequence,
      type: event.eventType as ContractProgressEvent["type"],
      stage: event.stage,
      processed: Number(event.processed),
      total: event.total === null ? null : Number(event.total),
      ratePerSecond: event.ratePerSecond,
      etaSeconds: event.etaSeconds,
      warningCode: event.warningCode,
      message: event.message,
      occurredAt: event.occurredAt.toISOString(),
    }));
  }

  stream(actor: ActorContext, jobId: string, afterSequence: number) {
    return new Observable<{
      id: string;
      type: string;
      retry?: number;
      data: ContractProgressEvent | Record<string, unknown>;
    }>((subscriber) => {
      let cursor = Number.isFinite(afterSequence)
        ? Math.max(0, afterSequence)
        : 0;
      let stopped = false;
      let timer: NodeJS.Timeout | undefined;
      const schedule = (milliseconds: number) => {
        if (!stopped) timer = setTimeout(() => void poll(), milliseconds);
      };
      const poll = async () => {
        try {
          const [job, events] = await Promise.all([
            this.get(actor, jobId),
            this.events(actor, jobId, cursor),
          ]);
          for (const event of events) {
            cursor = event.sequence;
            subscriber.next({
              id: String(event.sequence),
              type: event.type ?? "job.progress",
              retry: 1_000,
              data: event,
            });
          }
          if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) {
            subscriber.next({
              id: `${cursor}:terminal`,
              type:
                job.status === "SUCCEEDED"
                  ? "job.completed"
                  : job.status === "CANCELLED"
                    ? "job.cancelled"
                    : "job.failed",
              data: {
                jobId,
                status: job.status,
                errorCode: job.errorCode,
                completedAt: job.completedAt?.toISOString() ?? null,
              },
            });
            subscriber.complete();
            return;
          }
          schedule(events.length === 100 ? 0 : 1_000);
        } catch (error) {
          subscriber.error(error);
        }
      };
      void poll();
      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      };
    });
  }

  private assertVisible(
    actor: ActorContext,
    job: {
      requestedByUserId: string | null;
      subjectUserId: string | null;
      audience: SessionAudience;
    },
  ) {
    const admin = actor.audience === "ADMIN";
    if (
      job.audience !== actor.audience ||
      (!admin &&
        job.requestedByUserId !== actor.userId &&
        job.subjectUserId !== actor.userId)
    ) {
      throw new ForbiddenException();
    }
  }
}
