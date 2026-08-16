import { expect, test } from "@playwright/test";

import { loginSyntheticUser } from "./authentication";
import { TestTag, deploymentTags, syntheticResourcePrefix } from "./runtime";

test(
  "DELIVERY-004-SYNTHETIC a scheduled notebook write is visible and removed",
  {
    tag: deploymentTags(TestTag.DEPLOYMENT, TestTag.BROWSER, TestTag.NIGHTLY),
  },
  async ({ page }, testInfo) => {
    await loginSyntheticUser(page);
    const runIdentity =
      process.env.GITHUB_RUN_ID?.trim() || `${Date.now()}-${testInfo.retry}`;
    const name = `${syntheticResourcePrefix()} notebook ${runIdentity}`.slice(
      0,
      80,
    );
    let created = false;
    try {
      await page.goto("/notebooks");
      await page.getByLabel("新建生词本").fill(name);
      await page.getByRole("button", { name: "新建" }).click();
      const notebook = page.locator("article").filter({ hasText: name });
      await expect(notebook).toContainText("0 项");
      created = true;
    } finally {
      if (created) {
        await page.goto("/notebooks");
        const notebook = page.locator("article").filter({ hasText: name });
        await notebook.getByRole("link", { name: "打开" }).click();
        page.once("dialog", (dialog) => dialog.accept());
        await page.getByRole("button", { name: "删除生词本" }).click();
        await expect(page).toHaveURL(/\/notebooks$/);
        await expect(
          page.locator("article").filter({ hasText: name }),
        ).toHaveCount(0);
      }
    }
  },
);
