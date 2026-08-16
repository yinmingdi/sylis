import { describe, expect, it } from "vitest";

import { AuditStream, toAuditEventRows } from "./audit-event-rows";

describe("toAuditEventRows", () => {
  it("presents a security action with its actor and target identifiers", () => {
    const rows = toAuditEventRows(AuditStream.SECURITY, [
      {
        id: "event-id",
        action: "user.deletion-requested",
        actorUserId: "learner-id",
        targetType: "ContentDeletionRequest",
        targetId: "request-id",
        result: "SUCCEEDED",
        occurredAt: "2026-08-10T20:27:00.000Z",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        label: "user.deletion-requested",
        value: "SUCCEEDED",
        detail: expect.stringContaining("learner-id"),
      }),
    ]);
    expect(rows[0]?.detail).toContain("request-id");
  });

  it("presents a data-access event with owner and resource identifiers", () => {
    const rows = toAuditEventRows(AuditStream.DATA_ACCESS, [
      {
        id: "event-id",
        actorUserId: "support-id",
        ownerUserId: "learner-id",
        resourceKind: "DIAGNOSTIC_BUNDLE_REVISION",
        resourceId: "bundle-id",
        result: "SUCCEEDED",
        occurredAt: "2026-08-10T20:27:00.000Z",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        label: "DIAGNOSTIC_BUNDLE_REVISION",
        value: "SUCCEEDED",
        detail: expect.stringContaining("learner-id"),
      }),
    ]);
    expect(rows[0]?.detail).toContain("bundle-id");
  });
});
