import {
  AgentMessageBlockKind,
  AgentMessageRole,
} from "@sylis/agent-contracts";
import {
  DeterministicProviderScenario,
  deterministicProviderInstruction,
} from "@sylis/agent-contracts/testing";
import type { Page } from "@playwright/test";

import { registerUserViaApi } from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

test(
  "AGENT-011-MIXED-BLOCKS-MOBILE-E2E keeps ToolCall Blocks stable inside the mobile viewport",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.MOBILE),
  },
  async ({ page, namespace }) => {
    await registerUserViaApi(page, namespace, "agent-message-block-mobile");
    await page.goto("/agent");
    await page.getByRole("button", { name: "AI 对话" }).click();
    await expect(page).toHaveURL(/\/agent\/sessions\/[0-9a-f-]+/i);

    await page.getByLabel("能力").selectOption({ label: "学习问答" });
    await page
      .getByLabel("给 Agent 的消息")
      .fill(
        deterministicProviderInstruction(
          DeterministicProviderScenario.MIXED_MULTI_TOOL,
          JSON.stringify({ query: "bank", limit: 1 }),
        ),
      );
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(
      page.locator(".agent-run-status").getByText("已完成", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    const prepared = "Prepared two independent dictionary lookups.";
    const assistant = page
      .locator(`.agent-message[data-role="${AgentMessageRole.ASSISTANT}"]`)
      .filter({ hasText: prepared })
      .last();
    const toolBlocks = assistant.locator(
      `[data-block-kind="${AgentMessageBlockKind.TOOL_CALL}"]`,
    );
    await expect(toolBlocks).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, toolBlocks);

    await page.reload();
    const restoredToolBlocks = page
      .locator(`.agent-message[data-role="${AgentMessageRole.ASSISTANT}"]`)
      .filter({ hasText: prepared })
      .last()
      .locator(`[data-block-kind="${AgentMessageBlockKind.TOOL_CALL}"]`);
    await expect(restoredToolBlocks).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, restoredToolBlocks);
  },
);

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectInsideViewport(
  page: Page,
  blocks: import("@playwright/test").Locator,
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("MOBILE_VIEWPORT_MISSING");
  for (const block of await blocks.all()) {
    const box = await block.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  }
}
