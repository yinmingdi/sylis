import { expect, test } from "@playwright/test";

import { E2eControlPath, E2eStackStage, controlUrl } from "../runtime";

test.setTimeout(26 * 60_000);

test("loads deterministic fixtures and starts all deployable apps", async ({
  request,
}) => {
  const seed = await request.post(controlUrl(E2eControlPath.SEED), {
    timeout: 5 * 60_000,
  });
  expect(seed.ok()).toBe(true);
  const apps = await request.post(controlUrl(E2eControlPath.START_APPS), {
    timeout: 20 * 60_000,
  });
  expect(apps.ok()).toBe(true);
  const ready = await request.get(controlUrl(E2eControlPath.READY));
  expect(ready.ok()).toBe(true);
  await expect(ready.json()).resolves.toMatchObject({
    stage: E2eStackStage.READY,
  });
});
