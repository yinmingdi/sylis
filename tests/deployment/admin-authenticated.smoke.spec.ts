import { expect, test } from "@playwright/test";

import { loginSyntheticAdmin } from "./authentication";
import { TestTag, deploymentTags } from "./runtime";

test(
  "DELIVERY-003-ADMIN-SYNTHETIC a deployed operator session reads the control-plane overview",
  {
    tag: deploymentTags(TestTag.DEPLOYMENT, TestTag.BROWSER),
  },
  async ({ page }) => {
    await loginSyntheticAdmin(page);
    await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Admin navigation" }),
    ).toBeVisible();
  },
);
