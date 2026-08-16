import { JobKind } from "@sylis/job-contracts";
import { describe, expect, it, vi } from "vitest";

import { createHttpJobStore } from "../src";

describe("createHttpJobStore", () => {
  it("treats an empty successful claim response as an empty queue", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>();
    fetchImplementation.mockResolvedValue(new Response(null, { status: 200 }));
    const store = createHttpJobStore({
      baseUrl: "https://admin-api.test/",
      serviceToken: "service-token",
      fetch: fetchImplementation,
    });

    await expect(
      store.claim({
        kinds: [JobKind.DATA_EXPORT],
        leaseOwner: "worker-1",
        leaseToken: "lease-1",
        now: new Date("2026-08-08T00:00:00.000Z"),
        leaseExpiresAt: new Date("2026-08-08T00:01:00.000Z"),
      }),
    ).resolves.toBeNull();
  });
});
