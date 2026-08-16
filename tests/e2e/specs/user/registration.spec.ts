import { expect, test } from "@playwright/test";

import { registerUser } from "../../fixtures/accounts";
import { TestTag, e2eTags } from "../../runtime";

test(
  "IDENTITY-001-E2E a learner registers through the delivered email challenge",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ page }, testInfo) => {
    await registerUser(page, testInfo);
    await expect(page.getByRole("link", { name: "背单词" })).toBeVisible();

    await page.goto("/me/settings");
    await expect(page.getByRole("heading", { name: "账户设置" })).toBeVisible();
  },
);
