import { randomUUID } from "node:crypto";

import {
  createPrismaClient,
  JobAttemptStatus,
  JobOwnerType,
  JobStatus,
} from "@sylis/database";
import {
  JobCancellationErrorCode,
  JobKind,
  JobProgressErrorCode,
} from "@sylis/job-contracts";
import { afterAll, describe, expect, it } from "vitest";

import { createPrismaJobStore, JobFailureClass } from "../src";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const adminApiDatabase = databaseUrl
  ? createPrismaClient({
      url: databaseUrlWithRole(databaseUrl, "sylis_admin_api"),
      log: ["error"],
    })
  : null;
const describeDatabase = database ? describe : describe.skip;

describeDatabase("PrismaJobStore", () => {
  afterAll(async () => {
    await Promise.all([
      database?.$disconnect(),
      adminApiDatabase?.$disconnect(),
    ]);
  });

  it("claims a job without requiring row-lock permission on AgentRun", async () => {
    const jobId = randomUUID();
    const now = new Date("2026-08-08T19:00:00.000Z");
    await database!.job.create({
      data: {
        id: jobId,
        kind: JobKind.DATA_EXPORT,
        ownerType: JobOwnerType.USER_EXPORT,
        ownerId: randomUUID(),
        inputRef: { requestId: randomUUID() },
        inputHash: `sha256:${randomUUID()}`,
        idempotencyKey: `job-runtime-admin-api-claim-${jobId}`,
        priority: 32_000,
        nextAttemptAt: now,
      },
    });

    const store = createPrismaJobStore(adminApiDatabase!, {
      checkpointKey: new Uint8Array(32).fill(1),
    });
    const attempt = await store.claim({
      kinds: [JobKind.DATA_EXPORT],
      leaseOwner: "admin-api-integration-worker",
      leaseToken: randomUUID(),
      now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
    expect(attempt).toMatchObject({ jobId });
    await expect(
      store.finish(
        attempt!,
        { resultType: "admin-api-claim-integration-test" },
        new Date(now.getTime() + 1_000),
      ),
    ).resolves.toBe(true);
  });

  it("commits cancellation when it was requested before successful completion", async () => {
    const jobId = randomUUID();
    const now = new Date("2026-08-08T20:00:00.000Z");
    await database!.job.create({
      data: {
        id: jobId,
        kind: JobKind.DATA_EXPORT,
        ownerType: JobOwnerType.USER_EXPORT,
        ownerId: randomUUID(),
        inputRef: { requestId: randomUUID() },
        inputHash: `sha256:${randomUUID()}`,
        idempotencyKey: `job-runtime-cancellation-${jobId}`,
        nextAttemptAt: now,
      },
    });

    const store = createPrismaJobStore(database!, {
      checkpointKey: new Uint8Array(32).fill(1),
    });
    const attempt = await store.claim({
      kinds: [JobKind.DATA_EXPORT],
      leaseOwner: "integration-worker",
      leaseToken: randomUUID(),
      now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
    expect(attempt).not.toBeNull();

    await database!.job.update({
      where: { id: jobId },
      data: { cancelRequestedAt: new Date(now.getTime() + 1_000) },
    });
    await expect(
      store.finish(
        attempt!,
        { resultType: "integration-test" },
        new Date(now.getTime() + 2_000),
      ),
    ).resolves.toBe(true);

    await expect(
      database!.job.findUniqueOrThrow({ where: { id: jobId } }),
    ).resolves.toMatchObject({
      status: JobStatus.CANCELLED,
      resultRef: null,
      errorCode: JobCancellationErrorCode.REQUESTED,
    });
    await expect(
      database!.jobAttempt.findUniqueOrThrow({
        where: { id: attempt!.attemptId },
      }),
    ).resolves.toMatchObject({ status: JobAttemptStatus.CANCELLED });
  });

  it("commits cancellation when it was requested before handler failure", async () => {
    const jobId = randomUUID();
    const now = new Date("2026-08-08T21:00:00.000Z");
    await database!.job.create({
      data: {
        id: jobId,
        kind: JobKind.DATA_EXPORT,
        ownerType: JobOwnerType.USER_EXPORT,
        ownerId: randomUUID(),
        inputRef: { requestId: randomUUID() },
        inputHash: `sha256:${randomUUID()}`,
        idempotencyKey: `job-runtime-failure-cancellation-${jobId}`,
        nextAttemptAt: now,
      },
    });
    const store = createPrismaJobStore(database!, {
      checkpointKey: new Uint8Array(32).fill(1),
    });
    const attempt = await store.claim({
      kinds: [JobKind.DATA_EXPORT],
      leaseOwner: "integration-worker",
      leaseToken: randomUUID(),
      now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
    expect(attempt).not.toBeNull();

    await database!.job.update({
      where: { id: jobId },
      data: { cancelRequestedAt: new Date(now.getTime() + 1_000) },
    });
    await expect(
      store.fail(
        attempt!,
        {
          failureClass: JobFailureClass.PERMANENT,
          errorCode: "HANDLER_FAILED",
        },
        new Date(now.getTime() + 2_000),
      ),
    ).resolves.toBe(true);

    await expect(
      database!.job.findUniqueOrThrow({ where: { id: jobId } }),
    ).resolves.toMatchObject({
      status: JobStatus.CANCELLED,
      errorCode: JobCancellationErrorCode.REQUESTED,
    });
    await expect(
      database!.jobAttempt.findUniqueOrThrow({
        where: { id: attempt!.attemptId },
      }),
    ).resolves.toMatchObject({
      status: JobAttemptStatus.CANCELLED,
      failureClass: JobFailureClass.CANCELLED,
    });
  });

  it("rejects writes from a running attempt after a newer fencing token exists", async () => {
    const jobId = randomUUID();
    const now = new Date("2026-08-08T22:00:00.000Z");
    await database!.job.create({
      data: {
        id: jobId,
        kind: JobKind.DATA_EXPORT,
        ownerType: JobOwnerType.USER_EXPORT,
        ownerId: randomUUID(),
        inputRef: { requestId: randomUUID() },
        inputHash: `sha256:${randomUUID()}`,
        idempotencyKey: `job-runtime-fencing-${jobId}`,
        nextAttemptAt: now,
      },
    });
    const store = createPrismaJobStore(database!, {
      checkpointKey: new Uint8Array(32).fill(1),
    });
    const staleAttempt = await store.claim({
      kinds: [JobKind.DATA_EXPORT],
      leaseOwner: "stale-worker",
      leaseToken: randomUUID(),
      now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
    expect(staleAttempt).not.toBeNull();
    const [nextToken] = await database!.$queryRawUnsafe<
      Array<{ value: bigint }>
    >("SELECT nextval('job_fencing_token_seq')::bigint AS value");
    expect(nextToken).toBeDefined();
    await database!.jobAttempt.create({
      data: {
        jobId,
        attemptNumber: 2,
        handlerVersion: staleAttempt!.handlerVersion,
        checkpointSchemaVersion: staleAttempt!.checkpointSchemaVersion,
        leaseOwner: "current-worker",
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        heartbeatAt: now,
        fencingToken: nextToken!.value,
      },
    });

    const writeAt = new Date(now.getTime() + 1_000);
    await expect(
      store.heartbeat(
        staleAttempt!,
        writeAt,
        new Date(writeAt.getTime() + 60_000),
      ),
    ).resolves.toBe(false);
    await expect(
      store.progress(
        staleAttempt!,
        { stage: "STALE_ATTEMPT", processed: 1, total: 1 },
        writeAt,
      ),
    ).resolves.toBe(false);
  });

  it("does not replay a model-backed job after an expired lease", async () => {
    const jobId = randomUUID();
    const claimedAt = new Date("2026-08-08T23:00:00.000Z");
    const leaseExpiresAt = new Date(claimedAt.getTime() + 60_000);
    await database!.job.create({
      data: {
        id: jobId,
        kind: JobKind.ASSET_EMBEDDING,
        ownerType: JobOwnerType.ASSET_REVISION,
        ownerId: randomUUID(),
        inputRef: { requestId: randomUUID() },
        inputHash: `sha256:${randomUUID()}`,
        idempotencyKey: `job-runtime-reconciliation-${jobId}`,
        priority: 1_000,
        nextAttemptAt: claimedAt,
      },
    });
    const store = createPrismaJobStore(database!, {
      checkpointKey: new Uint8Array(32).fill(1),
    });
    const expiredAttempt = await store.claim({
      kinds: [JobKind.ASSET_EMBEDDING],
      leaseOwner: "expired-worker",
      leaseToken: randomUUID(),
      now: claimedAt,
      leaseExpiresAt,
    });
    expect(expiredAttempt).not.toBeNull();

    await expect(
      store.claim({
        kinds: [JobKind.ASSET_EMBEDDING],
        leaseOwner: "replacement-worker",
        leaseToken: randomUUID(),
        now: new Date(leaseExpiresAt.getTime() + 1),
        leaseExpiresAt: new Date(leaseExpiresAt.getTime() + 60_001),
      }),
    ).resolves.toBeNull();
    await expect(
      database!.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { attempts: true },
      }),
    ).resolves.toMatchObject({
      status: JobStatus.FAILED,
      errorCode: "JOB_RECONCILIATION_REQUIRED",
      attempts: [
        expect.objectContaining({
          id: expiredAttempt!.attemptId,
          status: JobAttemptStatus.UNKNOWN_OUTCOME,
          failureClass: JobFailureClass.UNKNOWN_OUTCOME,
        }),
      ],
    });
  });

  it("keeps progress monotonic within an attempt stage and preserves it at completion", async () => {
    const jobId = randomUUID();
    const now = new Date("2026-08-09T00:00:00.000Z");
    await database!.job.create({
      data: {
        id: jobId,
        kind: JobKind.DATA_EXPORT,
        ownerType: JobOwnerType.USER_EXPORT,
        ownerId: randomUUID(),
        inputRef: { requestId: randomUUID() },
        inputHash: `sha256:${randomUUID()}`,
        idempotencyKey: `job-runtime-progress-${jobId}`,
        priority: 1_000,
        nextAttemptAt: now,
      },
    });
    const store = createPrismaJobStore(database!, {
      checkpointKey: new Uint8Array(32).fill(1),
    });
    const attempt = await store.claim({
      kinds: [JobKind.DATA_EXPORT],
      leaseOwner: "progress-worker",
      leaseToken: randomUUID(),
      now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
    expect(attempt).not.toBeNull();

    await expect(
      store.progress(
        attempt!,
        { stage: "COLLECTING", processed: 5, total: 10 },
        new Date(now.getTime() + 1_000),
      ),
    ).resolves.toBe(true);
    await expect(
      store.progress(
        attempt!,
        { stage: "COLLECTING", processed: 4, total: 10 },
        new Date(now.getTime() + 2_000),
      ),
    ).rejects.toThrow(JobProgressErrorCode.REGRESSION);
    await expect(
      store.progress(
        attempt!,
        { stage: "UPLOADING", processed: 0, total: 1 },
        new Date(now.getTime() + 3_000),
      ),
    ).resolves.toBe(true);
    await expect(
      store.finish(
        attempt!,
        { resultType: "integration-test" },
        new Date(now.getTime() + 4_000),
      ),
    ).resolves.toBe(true);

    await expect(
      database!.jobProgressEvent.findFirstOrThrow({
        where: { jobId },
        orderBy: { sequence: "desc" },
      }),
    ).resolves.toMatchObject({ processed: 0n, total: 1n });
  });
});

function databaseUrlWithRole(databaseUrl: string, role: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}
