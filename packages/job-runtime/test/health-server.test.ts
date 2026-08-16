import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import {
  JobWorkerService,
  JobWorkerStatus,
  startWorkerHealthServer,
  type JobWorkerState,
} from "../src/index";

describe("worker health server", () => {
  it("stays live but not ready while the worker is recovering", async () => {
    const state: JobWorkerState = {
      status: JobWorkerStatus.RECOVERING,
      jobId: null,
      attemptId: null,
      updatedAt: new Date().toISOString(),
    };
    const server = startWorkerHealthServer({
      port: 0,
      service: JobWorkerService.AUTOMATION_EXECUTOR,
      state: () => state,
    });

    try {
      await once(server, "listening");
      const { port } = server.address() as AddressInfo;
      const [live, ready] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/live`),
        fetch(`http://127.0.0.1:${port}/ready`),
      ]);

      expect(live.status).toBe(200);
      expect(ready.status).toBe(503);
      await expect(ready.json()).resolves.toMatchObject({
        status: "not_ready",
        worker: { status: JobWorkerStatus.RECOVERING },
      });
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
