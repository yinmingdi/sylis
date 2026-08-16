import {
  SecurityAuditResult,
  SupportGrantPurpose,
  SupportResourceKind,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import type { ModelGatewayClient } from "../../adapters/model-gateway.client";
import { DiagnosticBundleService } from "./diagnostic-bundle.service";

describe("DiagnosticBundleService support access", () => {
  it("binds the redacted revision read and owner-service audit in one transaction", async () => {
    const database = databaseFixture();
    const service = new DiagnosticBundleService(
      database as unknown as SylisDatabase,
      {} as ModelGatewayClient,
    );

    await service.supportRead("api", {
      grantId: GRANT_ID,
      requestId: "resource-read:support-access-0001",
      operatorUserId: SUPPORT_ID,
      ownerUserId: USER_ID,
      bundleId: BUNDLE_ID,
      revisionId: REVISION_ID,
    });

    expect(database.diagnosticBundleRevision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: REVISION_ID,
          bundleId: BUNDLE_ID,
          bundle: { ownerUserId: USER_ID },
        }),
      }),
    );
    expect(database.dataAccessAuditEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          actorUserId: SUPPORT_ID,
          ownerUserId: USER_ID,
          supportGrantId: GRANT_ID,
          resourceKind: SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION,
          resourceId: BUNDLE_ID,
          resourceRevisionId: REVISION_ID,
          result: SecurityAuditResult.SUCCEEDED,
          requestId: "resource-read:support-access-0001",
        }),
      ],
    });
    expect(database.$transaction).toHaveBeenCalledOnce();
  });
});

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SUPPORT_ID = "20000000-0000-4000-8000-000000000001";
const BUNDLE_ID = "30000000-0000-4000-8000-000000000001";
const REVISION_ID = "40000000-0000-4000-8000-000000000001";
const GRANT_ID = "50000000-0000-4000-8000-000000000001";

function databaseFixture() {
  const database = {
    supportGrant: {
      findFirst: vi.fn().mockResolvedValue({
        id: GRANT_ID,
        purpose: SupportGrantPurpose.TECHNICAL_DIAGNOSIS,
        resourceKind: SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION,
        resourceId: BUNDLE_ID,
        resourceRevisionId: REVISION_ID,
      }),
    },
    diagnosticBundleRevision: {
      findFirst: vi.fn().mockResolvedValue({
        id: REVISION_ID,
        bundleId: BUNDLE_ID,
        revisionNo: 2,
        contentHash: "sha256:test",
        redactedPayload: { status: "redacted" },
        confirmedAt: new Date(),
      }),
    },
    dataAccessAuditEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: typeof database) => Promise<unknown>) =>
      callback(database),
  );
  return database;
}
