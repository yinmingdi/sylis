import { expect } from "@playwright/test";

import { type E2eControlPath, E2eStackStage, controlUrl } from "../runtime";

export async function runStackTransition(
  path: E2eControlPath,
  expectedStage: E2eStackStage,
  timeoutMs: number,
): Promise<void> {
  const response = await fetch(controlUrl(path), {
    method: "POST",
    headers: { connection: "close" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json()) as {
    stage?: unknown;
    lastError?: unknown;
  };
  expect(
    response.ok,
    `stack transition ${path} failed with status ${response.status}: ${JSON.stringify(body)}`,
  ).toBe(true);
  expect(body).toMatchObject({ stage: expectedStage });
}
