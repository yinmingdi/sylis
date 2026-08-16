import {
  DiagnosticBundleRevisionStatus,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { DiagnosticBundleService } from "../src/modules/diagnostics/diagnostic-bundle.service";

describe("DiagnosticBundleService confirmation", () => {
  it("uses one timestamp for a confirmed revision's creation and confirmation", async () => {
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: "confirmed-revision-id",
      ...data,
    }));
    const transaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ currentRevisionId: "draft-revision-id" }]),
      diagnosticBundleRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: "draft-revision-id",
          bundleId: "bundle-id",
          status: DiagnosticBundleRevisionStatus.DRAFT,
          selectedRefs: [],
          redactedPayload: { schemaVersion: "diagnostic-bundle/1" },
          contentHash: `sha256:${"a".repeat(64)}`,
        }),
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(1),
        create,
      },
      diagnosticBundle: { update: vi.fn() },
    };
    const database = {
      $transaction: vi.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new DiagnosticBundleService(
      database as unknown as SylisDatabase,
      {} as ModelGatewayClient,
    );

    await service.confirm("user-id", "bundle-id", "draft-revision-id");

    const data = create.mock.calls[0]?.[0].data as {
      createdAt?: Date;
      confirmedAt?: Date;
    };
    expect(data.createdAt).toBeInstanceOf(Date);
    expect(data.confirmedAt).toBe(data.createdAt);
  });
});
