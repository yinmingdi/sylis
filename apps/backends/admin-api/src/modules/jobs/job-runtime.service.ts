import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import {
  isJobKind,
  JobKind,
  validateProgressInput,
  validateResultRef,
} from "@sylis/job-contracts";
import {
  createPrismaJobStore,
  type ClaimedAttempt,
  type JobFailure,
  type JobStore,
} from "@sylis/job-runtime";

import { AdminApiConfig } from "../../config/admin-api.config";
import { ADMIN_DATABASE } from "../../platform/database/database.module";

const SERVICE_JOB_KINDS = {
  "agent-executor": [
    JobKind.AGENT_RUN_ACTIVATION,
    JobKind.AGENT_TOOL_CONTINUATION,
  ],
  "agent-evaluator": [
    JobKind.AGENT_RELEASE_EVALUATION,
    JobKind.AGENT_RELEASE_JUDGEMENT,
  ],
  "asset-processor": [
    JobKind.ASSET_SCAN,
    JobKind.ASSET_EXTRACT,
    JobKind.ASSET_OCR,
    JobKind.ASSET_LEXICAL_INDEX,
    JobKind.ASSET_EMBEDDING,
    JobKind.ASSET_IMAGE_ANALYSIS,
  ],
  "automation-executor": [
    JobKind.DATA_EXPORT,
    JobKind.AUDIT_ARCHIVE,
    JobKind.AUDIT_ARCHIVE_PURGE,
    JobKind.AUDIT_EXPORT,
    JobKind.SOURCE_SYNC,
    JobKind.RETENTION_PURGE,
  ],
  "lexicon-builder": [JobKind.LEXICON_BUILD],
  "lexicon-publisher": [JobKind.LEXICON_PUBLISH, JobKind.LEXICON_VALIDATE],
} as const satisfies Readonly<Record<string, readonly JobKind[]>>;

@Injectable()
export class JobRuntimeService {
  private readonly store: JobStore;

  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
    private readonly config: AdminApiConfig,
  ) {
    this.store = createPrismaJobStore(database, {
      checkpointKey: config.checkpointKey,
    });
  }

  async claim(serviceKey: string, value: unknown) {
    const body = record(value);
    const kinds = array(body.kinds).map((kind) => {
      if (!isJobKind(kind)) throw new Error("JOB_KIND_INVALID");
      return kind;
    });
    this.assertKinds(serviceKey, kinds);
    return this.store.claim({
      kinds,
      leaseOwner: text(body.leaseOwner, "leaseOwner"),
      leaseToken: text(body.leaseToken, "leaseToken"),
      now: new Date(),
      leaseExpiresAt: new Date(Date.now() + this.config.leaseDurationMs),
    });
  }

  async heartbeat(serviceKey: string, value: unknown): Promise<boolean> {
    const attempt = await this.hydrate(serviceKey, value);
    const now = new Date();
    return this.store.heartbeat(
      attempt,
      now,
      new Date(now.getTime() + this.config.leaseDurationMs),
    );
  }

  async checkpoint(serviceKey: string, value: unknown): Promise<boolean> {
    const body = record(value);
    return this.store.checkpoint(
      await this.hydrate(serviceKey, body),
      record(body.value),
      new Date(),
    );
  }

  async progress(serviceKey: string, value: unknown): Promise<boolean> {
    const body = record(value);
    return this.store.progress(
      await this.hydrate(serviceKey, body),
      validateProgressInput(body.event),
      new Date(),
    );
  }

  async cancellation(
    serviceKey: string,
    value: unknown,
  ): Promise<boolean | null> {
    return this.store.cancellationRequested(
      await this.hydrate(serviceKey, value),
    );
  }

  async finish(serviceKey: string, value: unknown): Promise<boolean> {
    const body = record(value);
    return this.store.finish(
      await this.hydrate(serviceKey, body),
      validateResultRef(body.result),
      new Date(),
    );
  }

  async fail(serviceKey: string, value: unknown): Promise<boolean> {
    const body = record(value);
    return this.store.fail(
      await this.hydrate(serviceKey, body),
      record(body.failure) as unknown as JobFailure,
      new Date(),
    );
  }

  private async hydrate(
    serviceKey: string,
    value: unknown,
  ): Promise<ClaimedAttempt> {
    const body = record(value);
    const attemptId = text(body.attemptId, "attemptId");
    const jobId = text(body.jobId, "jobId");
    const found = await this.database.jobAttempt.findUnique({
      where: { id: attemptId },
      include: { job: true },
    });
    if (!found || found.jobId !== jobId)
      throw new NotFoundException("JOB_ATTEMPT_NOT_FOUND");
    this.assertKinds(serviceKey, [found.job.kind as JobKind]);
    return {
      jobId,
      attemptId,
      attemptNumber: found.attemptNumber,
      kind: found.job.kind as JobKind,
      inputRef: found.job.inputRef as Record<string, unknown>,
      inputHash: found.job.inputHash,
      handlerVersion: found.handlerVersion,
      checkpointSchemaVersion: found.checkpointSchemaVersion,
      fencingToken: BigInt(text(body.fencingToken, "fencingToken")),
      leaseToken: text(body.leaseToken, "leaseToken"),
      leaseExpiresAt: found.leaseExpiresAt,
      checkpoint: null,
    };
  }

  private assertKinds(serviceKey: string, kinds: readonly JobKind[]): void {
    const allowed =
      SERVICE_JOB_KINDS[serviceKey as keyof typeof SERVICE_JOB_KINDS];
    if (
      !allowed ||
      kinds.some((kind) => !(allowed as readonly JobKind[]).includes(kind))
    ) {
      throw new ForbiddenException("JOB_KIND_NOT_ALLOWED_FOR_SERVICE");
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JOB_RUNTIME_BODY_INVALID");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("JOB_RUNTIME_ARRAY_INVALID");
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`JOB_RUNTIME_FIELD_INVALID:${field}`);
  return value;
}
