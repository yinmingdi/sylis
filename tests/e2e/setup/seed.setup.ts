import { test } from "@playwright/test";

import { runStackTransition } from "../fixtures/stack-control";
import { E2eControlPath, E2eStackStage } from "../runtime";

test.setTimeout(26 * 60_000);

test("loads deterministic fixtures and starts all deployable apps", async () => {
  await runStackTransition(
    E2eControlPath.SEED,
    E2eStackStage.SEEDED,
    5 * 60_000,
  );
  await runStackTransition(
    E2eControlPath.START_APPS,
    E2eStackStage.READY,
    20 * 60_000,
  );
});
