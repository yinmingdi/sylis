import { test } from "@playwright/test";

import { runStackTransition } from "../fixtures/stack-control";
import { E2eControlPath, E2eStackStage } from "../runtime";

test.setTimeout(3 * 60_000);

test("captures diagnostics and removes the isolated stack", async () => {
  await runStackTransition(
    E2eControlPath.CLEANUP,
    E2eStackStage.STOPPED,
    2 * 60_000,
  );
});
