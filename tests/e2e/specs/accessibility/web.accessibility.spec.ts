import {
  AgentOwnerCommandKind,
  AgentResourceKind,
} from "@sylis/agent-contracts";
import {
  DeterministicProviderScenario,
  deterministicProviderInstruction,
} from "@sylis/agent-contracts/testing";
import { LexicalTargetKind } from "@sylis/api-client/user";
import type { Page, TestInfo } from "@playwright/test";

import { expectNoAccessibilityViolations } from "../../fixtures/accessibility";
import {
  authenticatedMutationHeaders,
  registerUser,
} from "../../fixtures/accounts";
import { E2eAssetFixtureKind, e2eAssetFixture } from "../../fixtures/assets";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

test(
  "UX-002-A11Y public authentication routes meet WCAG A and AA rules",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.ACCESSIBILITY, TestTag.NIGHTLY),
  },
  async ({ page }) => {
    await page.goto("/login");
    const loginHeading = page.getByRole("heading", { name: "欢迎回来" });
    await expect(loginHeading).toBeVisible();
    await expect(loginHeading.locator("..")).toHaveCSS("opacity", "1");
    await expectNoAccessibilityViolations(page);

    await page
      .getByPlaceholder("请输入邮箱地址")
      .fill("missing-user@sylis.test");
    const password = page.getByPlaceholder("请输入密码");
    await password.fill("Missing-user-Aa1!");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(password).toBeFocused();
    await expectNoAccessibilityViolations(page);

    await page.goto("/register");
    const registerHeading = page.getByRole("heading", { name: "创建账户" });
    await expect(registerHeading).toBeVisible();
    await expect(registerHeading.locator("..")).toHaveCSS("opacity", "1");
    await expect(
      page.getByRole("link", { name: "立即登录" }).locator(".."),
    ).toHaveCSS("opacity", "1");
    await expectNoAccessibilityViolations(page);
  },
);

test(
  "UX-003-DYNAMIC-A11Y Agent running and waiting states meet WCAG A and AA rules",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.ACCESSIBILITY, TestTag.NIGHTLY),
  },
  async ({ page, namespace }, testInfo) => {
    await registerAndOpenAgent(page, testInfo);
    await submitInstruction(
      page,
      deterministicProviderInstruction(
        DeterministicProviderScenario.DELAY,
        "Hold this response for an accessibility scan.",
      ),
    );
    await expectRunStatus(page, "执行中");
    await expect(page.getByRole("log", { name: "会话时间线" })).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expectRunStatus(page, "已取消");

    await submitInstruction(
      page,
      deterministicProviderInstruction(
        DeterministicProviderScenario.WAIT,
        JSON.stringify({
          reasonCode: "USER_CLARIFICATION_REQUIRED",
          correlationKey: `a11y/${namespace.value}`,
        }),
      ),
    );
    await expectRunStatus(page, "等待操作");
    await expect(page.getByLabel("补充信息")).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.getByLabel("补充信息").fill("Continue after the scan.");
    await page.getByRole("button", { name: "提交", exact: true }).click();
    await expectRunStatus(page, "已完成");
  },
);

test(
  "UX-003-PROPOSAL-A11Y Agent proposal dialog supports axe and keyboard focus restoration",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.ACCESSIBILITY, TestTag.NIGHTLY),
  },
  async ({ page, namespace }, testInfo) => {
    await registerUser(page, testInfo);
    const headers = await authenticatedMutationHeaders(page);
    const notebookResponse = await page.request.post("/api/v1/notebooks", {
      headers,
      data: { name: `Accessibility proposal ${namespace.value}` },
    });
    expect(notebookResponse.ok()).toBeTruthy();
    const notebook = (await notebookResponse.json()) as { id: string };
    const searchResponse = await page.request.get(
      "/api/v1/lexicon/search?q=bank&limit=1",
    );
    expect(searchResponse.ok()).toBeTruthy();
    const search = (await searchResponse.json()) as {
      data: { headwords: Array<{ headwordId: string }> };
    };
    const headwordId = search.data.headwords[0]?.headwordId;
    expect(headwordId).toBeTruthy();
    await openAgent(page);
    await submitInstruction(
      page,
      deterministicProviderInstruction(
        DeterministicProviderScenario.PROPOSAL,
        JSON.stringify({
          commandKind: AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD,
          target: { kind: AgentResourceKind.NOTEBOOK, id: notebook.id },
          input: {
            target: { kind: LexicalTargetKind.HEADWORD, id: headwordId },
            note: "Accessibility proposal fixture.",
            tags: ["a11y"],
          },
        }),
      ),
    );

    const trigger = page.getByRole("button", { name: "查看批准" }).last();
    const dialog = page.getByRole("dialog", { name: "成果检查器" });
    if (await dialog.isVisible()) {
      await dialog.getByRole("button", { name: "关闭检查器" }).click();
      await expect(dialog).toHaveCount(0);
    }
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
    await expectNoAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page
      .getByRole("region", { name: "操作批准" })
      .getByRole("button", { name: "拒绝" })
      .click();
    await expectRunStatus(page, "已完成");
  },
);

test(
  "UX-003-UPLOAD-A11Y Agent upload progress and resulting asset meet WCAG A and AA rules",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.ACCESSIBILITY, TestTag.NIGHTLY),
  },
  async ({ page }, testInfo) => {
    await registerAndOpenAgent(page, testInfo);
    const fixture = e2eAssetFixture(E2eAssetFixtureKind.TEXT);
    let releaseUpload: () => void = () => undefined;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    await page.route("**/*", async (route) => {
      if (route.request().method() === "PUT") {
        await uploadGate;
      }
      await route.continue();
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: fixture.name,
      mimeType: fixture.mimeType,
      buffer: fixture.buffer,
    });
    await expect(page.getByRole("status")).toContainText("上传中");
    await expectNoAccessibilityViolations(page);
    releaseUpload();
    await expect(page.getByText(fixture.name, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.unrouteAll({ behavior: "wait" });
    await expectNoAccessibilityViolations(page);
  },
);

async function registerAndOpenAgent(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  await registerUser(page, testInfo);
  await openAgent(page);
}

async function openAgent(page: Page): Promise<void> {
  await page.goto("/agent");
  await expect(
    page.getByRole("heading", { name: "智能学习，事半功倍" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "AI 对话" }).click();
  await expect(page).toHaveURL(/\/agent\/sessions\/[0-9a-f-]+/i);
  await expect(page.getByText("实时", { exact: true })).toBeVisible();
}

async function submitInstruction(page: Page, content: string): Promise<void> {
  await page.getByLabel("能力").selectOption({ label: "学习问答" });
  await page.getByLabel("给 Agent 的消息").fill(content);
  await page.getByRole("button", { name: "发送", exact: true }).click();
}

async function expectRunStatus(page: Page, label: string): Promise<void> {
  await expect(
    page.locator(".agent-run-status").getByText(label, { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
}

test(
  "UX-003-A11Y the authenticated learning and Agent shell meets WCAG A and AA rules",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.ACCESSIBILITY, TestTag.NIGHTLY),
  },
  async ({ page }, testInfo) => {
    await registerUser(page, testInfo);
    await expectNoAccessibilityViolations(page);

    await page.goto("/agent");
    await expect(
      page.getByRole("heading", { name: "智能学习，事半功倍" }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);
  },
);
