import { expect, test } from "@playwright/test";

import { loginSyntheticUser } from "./authentication";
import { TestTag, deploymentTags } from "./runtime";

test(
  "DELIVERY-003-WEB-SYNTHETIC a deployed learner session reads study and lexicon details",
  {
    tag: deploymentTags(TestTag.DEPLOYMENT, TestTag.BROWSER),
  },
  async ({ page }) => {
    await loginSyntheticUser(page);
    await expect(page.getByRole("heading", { name: "背单词" })).toBeVisible();
    await expect(page.getByText("今日计划尚未生成。")).toBeVisible();

    await page.goto("/lexicon/search");
    await page.getByLabel("搜索词典").fill("bank");
    await page.getByLabel("搜索词典").press("Enter");
    const result = page.getByRole("link").filter({ hasText: /^bank/ }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page.getByRole("heading", { name: "bank" })).toBeVisible();
    await expect(page.getByText("银行", { exact: true })).toBeVisible();
    await expect(page.getByText("岸；河岸", { exact: true })).toBeVisible();
  },
);
