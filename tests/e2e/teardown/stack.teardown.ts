import { expect, test } from "@playwright/test";

import { E2eControlPath, E2eStackStage, controlUrl } from "../runtime";

test.setTimeout(3 * 60_000);

test("captures diagnostics and removes the isolated stack", async ({
  request,
}) => {
  const response = await request.post(controlUrl(E2eControlPath.CLEANUP), {
    timeout: 2 * 60_000,
  });
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    stage: E2eStackStage.STOPPED,
  });
});
