import { test } from "@playwright/test";

import { runStackTransition } from "../fixtures/stack-control";
import { E2eControlPath, E2eStackStage } from "../runtime";

test.setTimeout(11 * 60_000);

test("installs the Prisma schema and database invariants", async () => {
  await runStackTransition(
    E2eControlPath.DATABASE_INSTALL,
    E2eStackStage.DATABASE_INSTALLED,
    10 * 60_000,
  );
});
