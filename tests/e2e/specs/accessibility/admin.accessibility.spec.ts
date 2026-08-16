import { expect, test } from "@playwright/test";

import { expectNoAccessibilityViolations } from "../../fixtures/accessibility";
import { loginOperator } from "../../fixtures/operator";
import { TestTag, e2eTags } from "../../runtime";

test(
  "ADMIN-003-A11Y operator authentication meets WCAG A and AA rules",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.ACCESSIBILITY),
  },
  async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Sylis Admin" }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);
  },
);

test(
  "ADMIN-004-A11Y the authenticated operator shell meets WCAG A and AA rules",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.ACCESSIBILITY),
  },
  async ({ page }) => {
    await loginOperator(page);
    await expectNoAccessibilityViolations(page);
  },
);
