import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  JobKind as DatabaseJobKind,
  JobOwnerType,
  JobStatus,
  type SessionAudience,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import type { JobProgressEvent as ContractProgressEvent } from "@sylis/job-contracts";
import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";

export interface CreateJobInput {
  id?: string;
  kind: DatabaseJobKind;
  requestRefId: string;
  inputHash: string;
  idempotencyKey: string;
  requestedByUserId?: string;
  subjectUserId?: string;
  audience: SessionAudience;
  priority?: number;
}

const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.SUCCEEDED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
];

@Injectable()
export class JobsService {
  constructor(@Inject(DATABASE) private readonly database: SylisDatabase) {}

  async create(transaction: SylisTransaction, input: CreateJobInput) {
    if (input.kind !== DatabaseJobKind.DATA_EXPORT) {
      throw new ConflictException("USER_JOB_KIND_NOT_OWNED");
    }
    if (!input.idempotencyKey?.trim()) {
      throw new ConflictException("IDEMPOTENCY_KEY_REQUIRED");
    }
    const ownerId = input.requestRefId;
    const existing = await transaction.job.findUnique({
      where: {
        ownerType_ownerId_kind_idempotencyKey: {
          ownerType: JobOwnerType.USER_EXPORT,
          ownerId,
          kind: input.kind,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.inputHash !== input.inputHash) {
        throw new ConflictException("IDEMPOTENCY_KEY_INPUT_CONFLICT");
      }
      return { ...existing, requestRefId: ownerId };
    }
    const job = await transaction.job.create({
      data: {
        id: input.id ?? randomUUID(),
        kind: input.kind,
        ownerType: JobOwnerType.USER_EXPORT,
        ownerId,
        inputRef: { requestId: ownerId },
        inputHash: input.inputHash,
        idempotencyKey: input.idempotencyKey,
        priority: input.priority ?? 0,
      },
    });
    return { ...job, requestRefId: ownerId };
  }

  async get(actor: ActorContext, jobId: string) {
    const job = await this.database.job.findFirst({
      where: {
        id: jobId,
        OR: [
          { dataExport: { userId: actor.userId } },
          {
            assetProcessing: {
              revision: { asset: { ownerUserId: actor.userId } },
            },
          },
        ],
      },
      include: {
        attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
        progress: { orderBy: { sequence: "desc" }, take: 1 },
      },
    });
    if (!job) throw new NotFoundException("JOB_NOT_FOUND");
    return job;
  }

  async cancel(actor: ActorContext, jobId: string) {
    const job = await this.get(actor, jobId);
    if (job.kind !== DatabaseJobKind.DATA_EXPORT) {
      throw new ConflictException("USER_JOB_KIND_NOT_OWNED");
    }
    if (TERMINAL_JOB_STATUSES.includes(job.status)) {
      throw new ConflictException("TERMINAL_JOB_NOT_CANCELLABLE");
    }
    return this.database.job.update({
      where: { id: jobId },
      data: { cancelRequestedAt: new Date() },
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
              type: event.type,
              data: event,
            });
          }
          if (TERMINAL_JOB_STATUSES.includes(job.status)) {
            subscriber.complete();
            return;
          }
          schedule(1_000);
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
}
