import {
  loginUserThroughUi,
  registerUserViaApi,
} from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";

import { TestTag, e2ePorts, e2eTags } from "../../runtime";

test(
  "UX-004-E2E a learner can cross the authenticated study and Agent journey",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.CROSS_BROWSER),
  },
  async ({ page, namespace }) => {
    const user = await registerUserViaApi(page, namespace, "cross-browser");
    await page.context().clearCookies();
    await loginUserThroughUi(page, user);
    await expect(page.getByRole("heading", { name: /词书列表/ })).toBeVisible();
    await page.goto("/agent");
    await expect(
      page.getByRole("heading", { name: "智能学习，事半功倍" }),
    ).toBeVisible();
  },
);

test(
  "ADMIN-005-E2E the operator application loads its JavaScript shell",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.CROSS_BROWSER),
  },
  async ({ page }) => {
    await page.goto(`http://127.0.0.1:${e2ePorts().admin}/login`);
    await expect(
      page.getByRole("heading", { name: "Sylis Admin" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "继续" })).toBeEnabled();
  },
);
