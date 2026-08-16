import { expect, test } from "@playwright/test";

import { E2eControlPath, E2eStackStage, controlUrl } from "../runtime";

test.setTimeout(11 * 60_000);

test("installs the Prisma schema and database invariants", async ({
  request,
}) => {
  const response = await request.post(
    controlUrl(E2eControlPath.DATABASE_INSTALL),
    {
      timeout: 10 * 60_000,
    },
  );
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    stage: E2eStackStage.DATABASE_INSTALLED,
  });
});
