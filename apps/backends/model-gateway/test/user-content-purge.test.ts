import {
  CredentialOwnerKind,
  ModelExecutionOwnerType,
  ModelPermitStatus,
  ModelPurposeKind,
  ModelUsageEntryType,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelContentBodyService } from "../src/modules/content-bodies/model-content-body.service";
import { ModelExchangeLifecycleService } from "../src/modules/content-bodies/model-exchange-lifecycle.service";
import { UserContentPurgeService } from "../src/modules/content-bodies/user-content-purge.service";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const REVISION_ID = "30000000-0000-4000-8000-000000000001";
const PERMIT_ID = "60000000-0000-4000-8000-000000000001";
const BUILD_RUN_ID = "70000000-0000-4000-8000-000000000001";
const ROUTE_RELEASE_ID = "80000000-0000-4000-8000-000000000001";

describe("UserContentPurgeService", () => {
  it("cryptoshreds every BYOK revision and writes retry-safe audit facts", async () => {
    const { service, transaction, bodies, exchanges } = fixture();

    await service.purge("automation-executor", REQUEST_ID, {
      attemptId: "40000000-0000-4000-8000-000000000001",
      fencingToken: 7n,
    });

    expect(bodies.cryptoshred).toHaveBeenCalled();
    expect(exchanges.purge).toHaveBeenCalled();
    expect(transaction.modelExecutionPermit.updateMany).toHaveBeenCalledWith({
      where: { id: PERMIT_ID, status: ModelPermitStatus.ISSUED },
      data: { status: ModelPermitStatus.REVOKED },
    });
    expect(transaction.modelUsageLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        ownerType: ModelExecutionOwnerType.BUILD_RUN,
        ownerId: BUILD_RUN_ID,
        permitId: PERMIT_ID,
        entryType: ModelUsageEntryType.RELEASE,
        units: -150n,
        costMicros: -1_000n,
      }),
    });
    expect(transaction.credentialRevision.updateMany).toHaveBeenCalledWith({
      where: { id: REVISION_ID, kekVersion: { not: "purged" } },
      data: expect.objectContaining({
        status: "REVOKED",
        kekVersion: "purged",
        maskedHint: "purged",
        metadata: {},
        ciphertext: expect.any(Buffer),
        encryptedDek: expect.any(Buffer),
      }),
    });
    expect(transaction.credentialSecurityEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(transaction.securityAuditEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it("rejects a stale retention attempt before decryptable content is touched", async () => {
    const { service, database, transaction } = fixture();
    database.jobAttempt.findFirst.mockResolvedValue(null);

    await expect(
      service.purge("automation-executor", REQUEST_ID, {
        attemptId: "40000000-0000-4000-8000-000000000001",
        fencingToken: 8n,
      }),
    ).rejects.toThrow("RETENTION_JOB_FENCING_REJECTED");

    expect(transaction.credentialRevision.updateMany).not.toHaveBeenCalled();
  });
});

function fixture() {
  const transaction = {
    modelExecutionPermit: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: PERMIT_ID,
          ownerType: ModelExecutionOwnerType.BUILD_RUN,
          ownerUserId: USER_ID,
          purpose: ModelPurposeKind.LEXICON_BUILD,
          routeReleaseId: ROUTE_RELEASE_ID,
          maxInputTokens: 100,
          maxOutputTokens: 50,
          maxCostMicros: 1_000n,
          requestKey: "user-purge-permit-release",
          credentialRevision: {
            profile: { ownerKind: CredentialOwnerKind.USER },
          },
          agentRunTarget: null,
          buildRunTarget: { buildRunId: BUILD_RUN_ID },
          evaluationRunTarget: null,
          assetRevisionTarget: null,
        },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    modelUsageLedger: { create: vi.fn() },
    credentialProfile: { update: vi.fn() },
    credentialRevision: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    credentialSecurityEvent: { createMany: vi.fn() },
    securityAuditEvent: { createMany: vi.fn() },
  };
  const database = {
    contentDeletionRequest: {
      findFirst: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        requestedByUserId: USER_ID,
        userTarget: { userId: USER_ID },
        purgeAfter: new Date("2020-01-01T00:00:00.000Z"),
      }),
    },
    jobAttempt: { findFirst: vi.fn().mockResolvedValue({ id: "attempt" }) },
    modelContentBody: {
      findMany: vi.fn().mockResolvedValue([{ id: "body-1" }]),
    },
    modelExchange: {
      findMany: vi.fn().mockResolvedValue([{ id: "exchange-1" }]),
    },
    credentialProfile: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "50000000-0000-4000-8000-000000000001",
          revisions: [{ id: REVISION_ID, kekVersion: "credential-kek-v1" }],
        },
      ]),
    },
    $transaction: vi.fn(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const bodies = { cryptoshred: vi.fn().mockResolvedValue(1) };
  const exchanges = {
    purge: vi.fn().mockResolvedValue({ exchanges: 1 }),
  };
  return {
    database,
    transaction,
    bodies,
    exchanges,
    service: new UserContentPurgeService(
      database as unknown as SylisDatabase,
      bodies as unknown as ModelContentBodyService,
      exchanges as unknown as ModelExchangeLifecycleService,
    ),
  };
}
