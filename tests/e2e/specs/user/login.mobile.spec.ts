import {
  loginUserThroughUi,
  registerUserViaApi,
} from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

test(
  "UX-001-E2E the mobile critical learner journey remains usable without horizontal overflow",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.MOBILE),
  },
  async ({ page, namespace }) => {
    const user = await registerUserViaApi(page, namespace, "mobile-journey");
    await page.context().clearCookies();
    await loginUserThroughUi(page, user);
    await expectNoHorizontalOverflow(page);

    await page.goto("/ai");
    await expect(
      page.getByRole("heading", { name: "智能学习，事半功倍" }),
    ).toBeVisible();
    await page.getByText("AI对话", { exact: true }).click();
    await expect(page).toHaveURL(/\/chat$/);

    await page.getByRole("button", { name: "对话历史" }).click();
    const historyDrawer = page.locator(".adm-popup-body-position-left").last();
    await expect(historyDrawer).toContainText("新聊天");
    expect(
      await historyDrawer.evaluate(
        (element) => getComputedStyle(element).position,
      ),
    ).toBe("fixed");

    await page.getByRole("button", { name: "聊天设置" }).click();
    const settingsDrawer = page.locator(".adm-popup-body-position-left").last();
    await expect(settingsDrawer).toContainText("聊天设置");
    await expect(settingsDrawer).toContainText("DeepSeek V4 Flash");
    expect(
      await settingsDrawer.evaluate(
        (element) => getComputedStyle(element).position,
      ),
    ).toBe("fixed");

    await page.goto("/word-detail/bank");
    await expect(page.getByText("bank", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "释义" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "例句", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "词组搭配" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  },
);

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
