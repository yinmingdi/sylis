import type { Page } from "@playwright/test";

import { registerUser } from "../../fixtures/accounts";
import { E2eAssetFixtureKind, e2eAssetFixture } from "../../fixtures/assets";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

test(
  "CONTENT-003-E2E a learner uploads text uses it as Agent context and deletes it",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ page }, testInfo) => {
    await registerUser(page, testInfo);
    const fixture = e2eAssetFixture(E2eAssetFixtureKind.TEXT);

    await uploadFixture(page, fixture);
    const asset = await expectReadyAsset(page, fixture.name);
    await asset.getByRole("button", { name: "加入", exact: true }).click();
    await expect(page).toHaveURL(/\/agent(?:\?|$)/);
    await page.getByRole("button", { name: "AI 对话" }).click();
    await expect(
      page.getByLabel("本次上下文").getByText(fixture.name, { exact: true }),
    ).toBeVisible();

    await page.goto("/agent/assets");
    const persisted = await expectReadyAsset(page, fixture.name);
    await persisted.getByRole("button", { name: "删除", exact: true }).click();
    await expect(assetRow(page, fixture.name)).toHaveCount(0);
  },
);

test(
  "CONTENT-004-E2E PDF and image assets become usable through the browser",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.NIGHTLY),
  },
  async ({ page }, testInfo) => {
    await registerUser(page, testInfo);
    for (const kind of [E2eAssetFixtureKind.PDF, E2eAssetFixtureKind.IMAGE]) {
      const fixture = e2eAssetFixture(kind);
      await uploadFixture(page, fixture);
      const asset = await expectReadyAsset(page, fixture.name);
      await expect(
        asset.getByRole("button", { name: "加入", exact: true }),
      ).toBeVisible();
      await asset.getByRole("button", { name: "删除", exact: true }).click();
      await expect(assetRow(page, fixture.name)).toHaveCount(0);
    }
  },
);

async function uploadFixture(
  page: Page,
  fixture: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.goto("/agent/assets");
  await expect(page.getByRole("heading", { name: "文件" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: fixture.name,
    mimeType: fixture.mimeType,
    buffer: fixture.buffer,
  });
  await expect(assetRow(page, fixture.name)).toBeVisible();
}

async function expectReadyAsset(page: Page, filename: string) {
  const asset = assetRow(page, filename);
  await expect(asset.getByText("可使用", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  return asset;
}

function assetRow(page: Page, filename: string) {
  return page.locator(".agent-asset").filter({ hasText: filename });
}
