import {
  OperatorRole,
  Prisma,
  SecurityAuditResult,
  SessionAudience,
  SessionAuthStrength,
  SupportGrantPurpose,
  SupportResourceKind,
  UserStatus,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { SupportGrantService } from "./support-grant.service";
import type { IdentityService } from "./identity.service";
import type { AgentApiClient } from "../../../integrations/agent-api/agent-api.client";
import type { ActorContext } from "../../../platform/auth/actor-context";
import type { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SUPPORT_ID = "20000000-0000-4000-8000-000000000001";
const ASSET_ID = "30000000-0000-4000-8000-000000000001";
const REVISION_ID = "40000000-0000-4000-8000-000000000001";
const GRANT_ID = "50000000-0000-4000-8000-000000000001";

describe("SupportGrantService", () => {
  it("SUPPORT-GRANT-001-UNIT requires recent reauthentication before inspecting a target", async () => {
    const { service, identity, database } = fixture();
    identity.hasRecentReauthentication.mockResolvedValue(false);

    await expect(service.preview(ACTOR, TARGET)).rejects.toThrow(
      "RECENT_REAUTHENTICATION_REQUIRED",
    );

    expect(database.user.findFirst).not.toHaveBeenCalled();
  });

  it("requires the exact owner, resource, and immutable revision", async () => {
    const { service, database } = fixture();
    database.contentAssetRevision.count.mockResolvedValue(0);

    await expect(service.preview(ACTOR, TARGET)).rejects.toThrow(
      "SUPPORT_RESOURCE_NOT_FOUND",
    );

    expect(database.contentAssetRevision.count).toHaveBeenCalledWith({
      where: {
        id: REVISION_ID,
        assetId: ASSET_ID,
        asset: { ownerUserId: USER_ID },
        status: { not: "PURGED" },
      },
    });
  });

  it("projects only the exact granted revision to the named Support operator", async () => {
    const { service, database, identity, agentApi } = fixture();
    identity.validateAdminSessionToken.mockResolvedValue({
      userId: SUPPORT_ID,
      roles: [OperatorRole.SUPPORT],
      reAuthenticatedAt: new Date(),
    });
    database.supportGrant.findUnique.mockResolvedValue({
      id: GRANT_ID,
      userId: USER_ID,
      supportUserId: SUPPORT_ID,
      resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
      resourceId: ASSET_ID,
      resourceRevisionId: REVISION_ID,
      purpose: SupportGrantPurpose.TECHNICAL_DIAGNOSIS,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    await service.access({
      token: "admin-session-token",
      grantId: GRANT_ID,
      requestId: "support-access-0001",
    });

    expect(agentApi.assetRevisionSupportView).toHaveBeenCalledWith({
      grantId: GRANT_ID,
      requestId: "support-access-0001",
      operatorUserId: SUPPORT_ID,
      ownerUserId: USER_ID,
      assetId: ASSET_ID,
      revisionId: REVISION_ID,
    });
    expect(database.dataAccessAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: SUPPORT_ID,
        ownerUserId: USER_ID,
        supportGrantId: GRANT_ID,
        resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
        resourceId: ASSET_ID,
        resourceRevisionId: REVISION_ID,
        result: SecurityAuditResult.SUCCEEDED,
        requestId: "support-access-0001",
      }),
    });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it("commits a denied audit before rejecting an unauthorized operator", async () => {
    const { service, database, identity, agentApi } = fixture();
    identity.validateAdminSessionToken.mockResolvedValue({
      userId: SUPPORT_ID,
      roles: [],
      reAuthenticatedAt: new Date(),
    });
    database.supportGrant.findUnique.mockResolvedValue(activeGrant());

    await expect(
      service.access({
        token: "admin-session-token",
        grantId: GRANT_ID,
        requestId: "support-access-denied-0001",
      }),
    ).rejects.toThrow("SUPPORT_GRANT_ACCESS_DENIED");

    expect(database.dataAccessAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: SUPPORT_ID,
        supportGrantId: GRANT_ID,
        result: SecurityAuditResult.DENIED,
        requestId: "support-access-denied-0001",
      }),
    });
    expect(agentApi.assetRevisionSupportView).not.toHaveBeenCalled();
  });

  it("commits a failed audit when the exact resource cannot be read", async () => {
    const { service, database, identity, agentApi } = fixture();
    identity.validateAdminSessionToken.mockResolvedValue({
      userId: SUPPORT_ID,
      roles: [OperatorRole.SUPPORT],
      reAuthenticatedAt: new Date(),
    });
    database.supportGrant.findUnique.mockResolvedValue(activeGrant());
    agentApi.assetRevisionSupportView.mockRejectedValue(
      new Error("support resource unavailable"),
    );

    await expect(
      service.access({
        token: "admin-session-token",
        grantId: GRANT_ID,
        requestId: "support-access-failed-0001",
      }),
    ).rejects.toThrow("support resource unavailable");

    expect(database.dataAccessAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: SUPPORT_ID,
        supportGrantId: GRANT_ID,
        result: SecurityAuditResult.FAILED,
        requestId: "support-access-failed-0001",
      }),
    });
  });

  it("writes the exact typed revision target in the grant transaction", async () => {
    const { service, database } = fixture();
    const preview = await service.preview(ACTOR, {
      ...TARGET,
      durationSeconds: 3_600,
    });

    await service.create(ACTOR, {
      ...TARGET,
      expiresAt: preview.expiresAt.toISOString(),
      actionDigest: preview.actionDigest,
      idempotencyKey: "support-grant-create-0001",
    });

    expect(database.supportGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
          resourceId: ASSET_ID,
          resourceRevisionId: REVISION_ID,
        }),
      }),
    );
    expect(
      database.supportGrantContentAssetRevisionTarget.create,
    ).toHaveBeenCalledWith({
      data: {
        grantId: GRANT_ID,
        assetId: ASSET_ID,
        revisionId: REVISION_ID,
      },
    });
  });
});

const ACTOR: ActorContext = {
  userId: USER_ID,
  sessionId: "60000000-0000-4000-8000-000000000001",
  audience: SessionAudience.USER,
  roles: [],
  authStrength: SessionAuthStrength.PASSWORD,
};

const TARGET = {
  supportUserId: SUPPORT_ID,
  resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
  resourceId: ASSET_ID,
  resourceRevisionId: REVISION_ID,
  purpose: SupportGrantPurpose.TECHNICAL_DIAGNOSIS,
  purposeDetails: "Inspect the selected failed upload.",
};

function activeGrant() {
  return {
    id: GRANT_ID,
    userId: USER_ID,
    supportUserId: SUPPORT_ID,
    resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
    resourceId: ASSET_ID,
    resourceRevisionId: REVISION_ID,
    purpose: SupportGrantPurpose.TECHNICAL_DIAGNOSIS,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };
}

function fixture() {
  const database = {
    user: {
      findFirst: vi.fn().mockResolvedValue({
        id: SUPPORT_ID,
        status: UserStatus.ACTIVE,
      }),
    },
    contentAssetRevision: { count: vi.fn().mockResolvedValue(1) },
    supportGrant: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn().mockResolvedValue({
        id: GRANT_ID,
        supportUserId: SUPPORT_ID,
        resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
        resourceId: ASSET_ID,
        resourceRevisionId: REVISION_ID,
        purpose: SupportGrantPurpose.TECHNICAL_DIAGNOSIS,
        purposeDetails: TARGET.purposeDetails,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        actionDigest: "sha256:test",
      }),
      update: vi.fn(),
    },
    supportGrantContentAssetRevisionTarget: { create: vi.fn() },
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    dataAccessAuditEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "70000000-0000-4000-8000-000000000001",
        requestId: "support-access-0001",
        result: "SUCCEEDED",
        occurredAt: new Date(),
      }),
    },
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (
      callback: (transaction: typeof database) => Promise<unknown>,
    ): Promise<unknown> => callback(database),
  );
  const identity = {
    hasRecentReauthentication: vi.fn().mockResolvedValue(true),
    validateAdminSessionToken: vi.fn(),
  };
  const agentApi = {
    assetRevisionSupportView: vi.fn().mockResolvedValue({ status: "READY" }),
  };
  return {
    database,
    identity,
    agentApi,
    service: new SupportGrantService(
      database as unknown as SylisDatabase,
      identity as unknown as IdentityService,
      agentApi as unknown as AgentApiClient,
      {} as FieldEncryptionService,
    ),
  };
}
