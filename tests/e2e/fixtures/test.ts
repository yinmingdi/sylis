import { test as base, type Browser, type Page } from "@playwright/test";
import { FixedClock } from "@sylis/test-support";

import { E2eFixtureTime, e2ePorts } from "../runtime";
import {
  createLearnerStorageState,
  createOperatorStorageState,
  learnerSessionStorageState,
  operatorSessionStorageState,
  type ApiLearnerFixture,
  type ApiOperatorFixture,
  type E2eStorageState,
} from "./api-setup";
import {
  E2eResourceKind,
  storageStatePath,
  testNamespace,
  workerNamespace,
  type E2eNamespace,
} from "./namespace";

interface E2eTestFixtures {
  clock: FixedClock;
  namespace: E2eNamespace;
  learnerPage: Page;
  operatorPage: Page;
}

interface E2eWorkerFixtures {
  workerNamespace: E2eNamespace;
  learnerAccount: ApiLearnerFixture;
  operatorAccount: ApiOperatorFixture;
}

export const test = base.extend<E2eTestFixtures, E2eWorkerFixtures>({
  workerNamespace: [
    async ({}, use, workerInfo) => {
      await use(workerNamespace(workerInfo));
    },
    { scope: "worker" },
  ],
  learnerAccount: [
    async ({ playwright, workerNamespace: namespace }, use, workerInfo) => {
      const account = await createLearnerStorageState({
        playwright,
        namespace,
        storageStatePath: storageStatePath(workerInfo, E2eResourceKind.LEARNER),
      });
      await use(account);
    },
    { scope: "worker" },
  ],
  operatorAccount: [
    async ({ playwright }, use, workerInfo) => {
      const account = await createOperatorStorageState({
        playwright,
        workerIndex: workerInfo.workerIndex,
        storageStatePath: storageStatePath(
          workerInfo,
          E2eResourceKind.OPERATOR,
        ),
      });
      await use(account);
    },
    { scope: "worker" },
  ],
  namespace: async ({}, use, testInfo) => {
    await use(testNamespace(testInfo));
  },
  clock: async ({}, use) => {
    await use(new FixedClock(E2eFixtureTime.BASELINE));
  },
  learnerPage: async ({ browser, learnerAccount, playwright }, use) => {
    await withPage(
      browser,
      await learnerSessionStorageState(playwright, learnerAccount),
      `http://127.0.0.1:${e2ePorts().web}`,
      use,
    );
  },
  operatorPage: async ({ browser, operatorAccount, playwright }, use) => {
    await withPage(
      browser,
      await operatorSessionStorageState(playwright, operatorAccount),
      `http://127.0.0.1:${e2ePorts().admin}`,
      use,
    );
  },
});

export { expect } from "@playwright/test";

async function withPage(
  browser: Browser,
  storageState: E2eStorageState,
  baseURL: string,
  use: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({ storageState, baseURL });
  try {
    await use(await context.newPage());
  } finally {
    await context.close();
  }
}
