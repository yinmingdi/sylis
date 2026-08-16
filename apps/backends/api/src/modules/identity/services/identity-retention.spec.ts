import {
  ContentDeletionStatus,
  SessionAudience,
  SessionAuthStrength,
  UserStatus,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { IdentityService } from "./identity.service";
import type { ApiConfig } from "../../../config/api.config";
import type { ActorContext } from "../../../platform/auth/actor-context";
import type { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import type { JobsService } from "../../jobs";
import type { RegistrationMailer } from "./registration-mailer";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000001";
const REQUEST_ID = "30000000-0000-4000-8000-000000000001";

describe("IdentityService account retention", () => {
  it("projects the device label used to identify a session", async () => {
    const { service, database } = fixture();

    await service.listSessions(ACTOR);

    expect(database.authSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ deviceLabel: true }),
      }),
    );
  });

  it("requires recent User reauthentication before opening a deletion request", async () => {
    const { service, database } = fixture();
    vi.spyOn(service, "hasRecentReauthentication").mockResolvedValue(false);

    await expect(
      service.requestAccountDeletion(ACTOR, "delete-request-001"),
    ).rejects.toThrow("RECENT_REAUTHENTICATION_REQUIRED");

    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("blocks deletion while any Operator role is active", async () => {
    const { service, transaction } = fixture();
    vi.spyOn(service, "hasRecentReauthentication").mockResolvedValue(true);
    transaction.user.findUnique.mockResolvedValue({
      status: UserStatus.ACTIVE,
      roles: [{ id: "40000000-0000-4000-8000-000000000001" }],
    });

    await expect(
      service.requestAccountDeletion(ACTOR, "delete-request-002"),
    ).rejects.toThrow("OPERATOR_ACCOUNT_DELETION_REQUIRES_ROLE_REVOCATION");

    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it("immediately disables access, sessions, and SupportGrants", async () => {
    const { service, transaction } = fixture();
    vi.spyOn(service, "hasRecentReauthentication").mockResolvedValue(true);

    await expect(
      service.requestAccountDeletion(ACTOR, "delete-request-003"),
    ).resolves.toMatchObject({ status: ContentDeletionStatus.QUEUED });

    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: expect.objectContaining({ status: UserStatus.DELETED }),
    });
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    expect(transaction.supportGrant.updateMany).toHaveBeenCalledWith({
      where: {
        revokedAt: null,
        OR: [{ userId: USER_ID }, { supportUserId: USER_ID }],
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nextAttemptAt: expect.any(Date) }),
    });
  });

  it("rejects a stale fencing token before purging Identity data", async () => {
    const { service, database } = fixture();
    database.contentDeletionRequest.findFirst.mockResolvedValue({
      id: REQUEST_ID,
      requestedByUserId: USER_ID,
      userTarget: { userId: USER_ID },
    });
    database.jobAttempt.findFirst.mockResolvedValue(null);

    await expect(
      service.purgeUser("automation-executor", REQUEST_ID, {
        attemptId: "50000000-0000-4000-8000-000000000001",
        fencingToken: 99n,
      }),
    ).rejects.toThrow("RETENTION_JOB_FENCING_REJECTED");

    expect(database.user.findFirst).not.toHaveBeenCalled();
  });
});

const ACTOR: ActorContext = {
  userId: USER_ID,
  sessionId: SESSION_ID,
  audience: SessionAudience.USER,
  roles: [],
  authStrength: SessionAuthStrength.PASSWORD,
};

function fixture() {
  const hiddenAt = new Date("2026-01-01T00:00:00.000Z");
  const purgeAfter = new Date("2026-02-01T00:00:00.000Z");
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentDeletionUserTarget: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    contentDeletionRequest: {
      create: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        status: ContentDeletionStatus.QUEUED,
        hiddenAt,
        purgeAfter,
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        status: UserStatus.ACTIVE,
        roles: [],
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    authSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    supportGrant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    job: { create: vi.fn().mockResolvedValue(undefined) },
    securityAuditEvent: { create: vi.fn().mockResolvedValue(undefined) },
  };
  const database = {
    $transaction: vi.fn(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    contentDeletionRequest: { findFirst: vi.fn() },
    jobAttempt: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    authSession: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    database,
    transaction,
    service: new IdentityService(
      database as unknown as SylisDatabase,
      { userContentRetentionMs: 30 * 24 * 60 * 60_000 } as ApiConfig,
      {} as RegistrationMailer,
      {} as FieldEncryptionService,
      {} as JobsService,
    ),
  };
}
