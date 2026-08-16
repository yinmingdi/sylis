import { describe, expect, it, vi } from "vitest";

import { runAgentReconciliationLoop } from "../src/runtime/reconciliation-loop";

describe("Agent reconciliation loop", () => {
  it("AGENT-009-UNIT polls reconciliation and stops with the worker signal", async () => {
    const abort = new AbortController();
    const reconcile = vi.fn(async () => {
      abort.abort();
    });

    await runAgentReconciliationLoop({
      reconcile,
      signal: abort.signal,
      intervalMs: 1,
    });

    expect(reconcile).toHaveBeenCalledOnce();
  });

  it("reports a transient reconciliation error without rejecting the worker", async () => {
    const abort = new AbortController();
    const error = new Error("temporary Agent API outage");
    const onError = vi.fn(() => abort.abort());

    await expect(
      runAgentReconciliationLoop({
        reconcile: async () => {
          throw error;
        },
        signal: abort.signal,
        intervalMs: 1,
        onError,
      }),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(error);
  });
});
