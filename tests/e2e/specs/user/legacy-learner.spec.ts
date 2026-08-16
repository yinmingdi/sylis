import { AgentMessageBlockKind } from "@sylis/agent-contracts";
import type { Page } from "@playwright/test";

import {
  authenticatedMutationHeaders,
  loginUserThroughUi,
  registerUserViaApi,
} from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

interface BookListEnvelope {
  data: Array<{
    id: string;
    title: string;
    editions?: Array<{ id: string }>;
  }>;
}

interface LegacyRouteExpectation {
  path: string;
  text: string | RegExp;
}

const legacyRouteMatrix: LegacyRouteExpectation[] = [
  { path: "/vocabulary-learning", text: /学习统计|暂未选择词书/ },
  { path: "/ai", text: "智能学习，事半功倍" },
  { path: "/explore", text: "探索英语世界" },
  { path: "/me", text: "个人中心" },
  { path: "/profile", text: "个人设置" },
  { path: "/settings", text: "个性化设置" },
  { path: "/vocabulary-test", text: "开始测试" },
  { path: "/vocabulary-test-history", text: "测试历史" },
  { path: "/vocabulary-book", text: "生词本" },
  { path: "/articles", text: /我的文章 \(\d+\)/ },
  { path: "/grammar-analysis", text: "语法解析" },
  { path: "/reddit", text: "Reddit" },
  { path: "/reddit/saved", text: "我的收藏" },
  { path: "/reddit/history", text: "阅读历史" },
  { path: "/word-detail/bank", text: "bank" },
];

test(
  "LEGACY-LEARNER-001-E2E every established learner route renders its original page",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page }) => {
    test.slow();
    const runtimeErrors = collectRuntimeErrors(page);
    const book = await firstBook(page);

    for (const route of [
      ...legacyRouteMatrix,
      { path: `/book-detail/${book.id}`, text: "调整学习任务量" },
    ]) {
      await page.goto(route.path);
      await expect(page.getByText(route.text).first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    expect(runtimeErrors).toEqual([]);
  },
);

test(
  "LEGACY-LEARNER-002-E2E book selection, word search, recitation hint, and detail stages remain usable",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page }) => {
    test.slow();
    const runtimeErrors = collectRuntimeErrors(page);
    const book = await firstBook(page);

    await page.goto("/books");
    await expect(page.getByText("词书统计", { exact: true })).toBeVisible();
    const search = page.getByPlaceholder("搜索词书名称或简介");
    await search.fill("不存在的词书");
    await expect(page.getByText("未找到符合条件的词书")).toBeVisible();
    await search.clear();
    await page.getByText(book.title, { exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/book-detail/${book.id}$`));
    await expect(
      page.getByText("调整学习任务量", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "开始学习" }).click();
    await expect(page).toHaveURL(/\/vocabulary-learning$/);
    await expect(page.getByText(book.title, { exact: true })).toBeVisible();

    await page
      .getByText("输入中英文 | 查词、翻译、润色...", { exact: true })
      .click();
    const wordSearch = page.locator(
      'input[placeholder="输入中英文 | 查词、翻译、润色..."]',
    );
    await expect(wordSearch).toBeVisible();
    await wordSearch.fill("bank");
    await page.getByText("bank", { exact: true }).last().click();
    await expect(page).toHaveURL(/\/word-detail\/bank$/);
    await expect(page.getByRole("button", { name: "释义" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "例句", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "词组搭配" })).toBeVisible();

    await page.goto("/vocabulary-learning");
    await page.getByRole("button", { name: "学习新单词" }).click();
    await expect(page).toHaveURL(/\/vocabulary-practice\?.*type=new/);
    await expect(page.getByText("不认识", { exact: true })).toBeVisible();
    await expect(page.getByText("认识", { exact: true })).toBeVisible();
    await page.getByText("点击空白处查看提示", { exact: true }).click();
    await expect(page.getByText("释义", { exact: true }).first()).toBeVisible();
    await page.getByText("认识", { exact: true }).click();
    await expect(page.getByRole("button", { name: "释义" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "例句", exact: true }),
    ).toBeVisible();

    expect(runtimeErrors).toEqual([]);
  },
);

test(
  "LEGACY-LEARNER-003-E2E original AI, explore, profile, and settings interactions remain present",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page }) => {
    test.slow();
    const runtimeErrors = collectRuntimeErrors(page);

    await page.goto("/ai");
    for (const feature of [
      "故事阅读",
      "填空阅读",
      "语法解析",
      "AI对话",
      "我的文章",
    ]) {
      await expect(page.getByText(feature, { exact: true })).toBeVisible();
    }
    await page.getByText("故事阅读", { exact: true }).click();
    await expect(page.getByText("单词来源", { exact: true })).toBeVisible();
    await expect(page.getByText("选择场景", { exact: true })).toBeVisible();
    await expect(page.getByText("选择难度", { exact: true })).toBeVisible();
    await expect(page.getByText("选择字数", { exact: true })).toBeVisible();
    await expect(page.getByText("选择文章类型", { exact: true })).toBeVisible();
    await page
      .locator(".adm-mask")
      .last()
      .click({ position: { x: 20, y: 20 } });

    await page.getByText("AI对话", { exact: true }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await page.getByRole("button", { name: "对话历史" }).click();
    await expect(page.getByPlaceholder("搜索聊天...")).toBeVisible();
    await page.getByRole("button", { name: "聊天设置" }).click();
    await expect(
      page.getByText("DeepSeek V4 Flash", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "关闭聊天设置" }).click();

    await page.goto("/explore");
    await expect(page.getByText("Reddit", { exact: true })).toBeVisible();
    for (const unavailable of ["X", "Quora", "Medium"]) {
      await expect(
        page.getByRole("heading", {
          name: `${unavailable} 即将上线`,
          exact: true,
        }),
      ).toBeVisible();
    }
    await page.getByText("Reddit", { exact: true }).click();
    await expect(page.getByPlaceholder("搜索帖子、话题...")).toBeVisible();

    await page.goto("/profile");
    await expect(page.getByText("修改昵称", { exact: true })).toBeVisible();
    await expect(page.getByText("修改邮箱", { exact: true })).toBeVisible();
    await page.getByText("修改密码", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: /当前密码/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /新密码/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /确认密码/ })).toBeVisible();
    await page.getByRole("button", { name: "取消", exact: true }).click();

    await page.goto("/settings");
    await expect(page.getByText("深色模式", { exact: true })).toBeVisible();
    for (const color of [
      "科技蓝",
      "活力橙",
      "自然绿",
      "优雅紫",
      "温馨粉",
      "深海青",
    ]) {
      await expect(page.getByText(color, { exact: true })).toBeVisible();
    }
    await page.getByRole("switch", { name: "开关" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    expect(runtimeErrors).toEqual([]);
  },
);

test(
  "LEGACY-LEARNER-004-E2E vocabulary assessment completes and appears in history",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page, namespace }) => {
    await registerUserViaApi(page, namespace, "legacy-assessment");
    await page.goto("/vocabulary-test");
    await page.getByText("开始测试", { exact: true }).click();
    await expect(page).toHaveURL(/\/vocabulary-test-exam$/);

    for (let index = 0; index < 10; index += 1) {
      await page.getByText("看答案", { exact: true }).click();
    }

    await expect(
      page.getByText("测试完成！", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("水平评估", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /返回首页/ }).click();
    await page.getByText("测试历史", { exact: true }).click();
    await expect(page.getByText("第 1 次测试", { exact: true })).toBeVisible();
    await expect(
      page.getByText("预估词汇量", { exact: true }).last(),
    ).toBeVisible();
  },
);

test(
  "LEGACY-LEARNER-005-E2E word collection, search, edit tools, and batch deletion remain usable",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page, namespace }) => {
    await registerUserViaApi(page, namespace, "legacy-notebook");
    await page.goto("/word-detail/bank");
    await expect(
      page.getByRole("button", { name: /^(加入生词本|已收藏)$/ }),
    ).toBeVisible();
    const collectedButton = page.getByRole("button", { name: "已收藏" });
    if (await collectedButton.isVisible()) {
      await collectedButton.click();
      await expect(
        page.getByRole("button", { name: "加入生词本" }),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "加入生词本" }).click();
    await expect(page.getByRole("button", { name: "已收藏" })).toBeVisible();

    await page.goto("/vocabulary-book");
    await expect(page).toHaveURL(/\/vocabulary-book$/);
    const wordList = page.locator('div[class*="wordsSection"]');
    await expect(wordList.getByText("bank", { exact: true })).toBeVisible();
    const headerActions = page
      .locator('div[class*="appBarContainer"]')
      .locator('div[class*="actions"] button');
    await headerActions.first().click();
    const search = page.getByPlaceholder("搜索单词或释义...");
    await search.fill("bank");
    await expect(wordList.getByText("bank", { exact: true })).toBeVisible();
    await search.fill("不存在的单词");
    await expect(wordList).toHaveCount(0);
    await expect(page.getByText("生词本为空", { exact: true })).toBeVisible();

    await page.goto("/vocabulary-book");
    await expect(page).toHaveURL(/\/vocabulary-book$/);
    await page
      .locator('div[class*="appBarContainer"]')
      .locator('div[class*="actions"] button')
      .last()
      .click();
    await wordList.getByText("bank", { exact: true }).click();
    await expect(page.getByRole("button", { name: "删除" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "生成文章" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "阅读填空" })).toBeEnabled();
    await page.getByRole("button", { name: "删除" }).click();
    await expect(page.getByText("生词本为空", { exact: true })).toBeVisible();
  },
);

test(
  "LEGACY-LEARNER-006-E2E chat sessions can be created, searched, renamed, archived, and deleted",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page, namespace }) => {
    await registerUserViaApi(page, namespace, "legacy-chat");
    await page.goto("/chat");
    await page.getByRole("button", { name: "新建对话" }).click();
    await expect(
      page.getByText("新对话", { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "对话历史" }).click();
    const search = page.getByPlaceholder("搜索聊天...");
    await search.fill("不存在的会话");
    await expect(page.getByText("没有找到匹配的会话")).toBeVisible();
    await search.clear();

    await page
      .getByRole("button", { name: "管理会话：新对话" })
      .first()
      .click();
    await page.getByRole("button", { name: /重命名/ }).click();
    const title = `旧版会话 ${namespace.value}-${Date.now()}`;
    const titleInput = page.locator('[class*="editInput"] input');
    await titleInput.fill(title);
    await titleInput.press("Enter");
    const renamedSessionMenu = page.getByRole("button", {
      name: `管理会话：${title}`,
    });
    await expect(renamedSessionMenu).toBeVisible();

    await renamedSessionMenu.click();
    await page.getByRole("button", { name: /归档/ }).click();
    await expect(renamedSessionMenu).toHaveCount(0);

    await page.getByText("新聊天", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "关闭对话历史" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "对话历史", exact: true }).click();
    await page
      .getByRole("button", { name: "管理会话：新对话" })
      .first()
      .click();
    await page.getByRole("button", { name: /重命名/ }).click();
    const deletedTitle = `待删除会话 ${namespace.value}-${Date.now()}`;
    await page.locator('[class*="editInput"] input').fill(deletedTitle);
    await page.locator('[class*="editInput"] input').press("Enter");
    const deletedSessionMenu = page.getByRole("button", {
      name: `管理会话：${deletedTitle}`,
    });
    await deletedSessionMenu.click();
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await expect(deletedSessionMenu).toHaveCount(0);
  },
);

test(
  "LEGACY-LEARNER-012-E2E chat sends through one typed Session SSE without polling",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page, namespace }) => {
    const requests: Array<{ method: string; url: string; type: string }> = [];
    page.on("request", (request) => {
      if (!request.url().includes("/api/agent/v1/")) return;
      requests.push({
        method: request.method(),
        url: request.url(),
        type: request.resourceType(),
      });
    });

    await registerUserViaApi(page, namespace, "legacy-typed-chat");
    await page.goto("/chat");
    await page.getByRole("button", { name: "新建对话" }).click();
    await expect
      .poll(
        () =>
          requests.filter(
            ({ type, url }) =>
              type === "eventsource" &&
              new URL(url).pathname.endsWith("/events"),
          ).length,
      )
      .toBe(1);
    requests.length = 0;

    const instruction = "Explain bank in one sentence.";
    await page.getByPlaceholder("输入你的学习问题").fill(instruction);
    await page.getByPlaceholder("输入你的学习问题").press("Enter");
    await expect(
      page
        .locator(`[data-block-kind="${AgentMessageBlockKind.PARAGRAPH}"]`)
        .filter({ hasText: instruction })
        .last(),
    ).toBeVisible({ timeout: 30_000 });

    expect(
      requests.filter(
        ({ method, url }) => method === "POST" && url.endsWith("/instructions"),
      ),
    ).toHaveLength(1);
    expect(
      requests.filter(
        ({ method, url }) =>
          method === "GET" &&
          /\/(messages|runs|artifacts|proposals)(?:\?|\/|$)/.test(url),
      ),
    ).toHaveLength(0);
    expect(requests.filter(({ type }) => type === "eventsource")).toHaveLength(
      0,
    );
  },
);

test(
  "LEGACY-LEARNER-007-E2E the original recite-detail-quiz flow persists completion on the server",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page, namespace }) => {
    await registerUserViaApi(page, namespace, "legacy-practice");
    await page.addInitScript(() => {
      Math.random = () => 0.9;
    });

    const book = await firstBook(page);
    const editionId = book.editions?.[0]?.id;
    expect(editionId).toBeTruthy();
    const enrollment = await page.request.post("/api/v1/study/enrollments", {
      data: {
        bookId: book.id,
        editionId,
        dailyNewLimit: 1,
      },
      headers: await authenticatedMutationHeaders(page),
    });
    expect(
      enrollment.ok() || enrollment.status() === 409,
      `enrollment failed with status ${enrollment.status()}`,
    ).toBeTruthy();

    await page.goto(`/vocabulary-practice?bookId=${book.id}&type=new`);
    await page.getByText("认识", { exact: true }).click();
    await expect(page.getByRole("button", { name: "释义" })).toBeVisible();

    const familiarAction = page
      .locator('div[class*="headerActions"]')
      .getByText("熟", { exact: true });
    await familiarAction.click();
    const firstChoice = page
      .locator('div[class*="optionsContainer"]')
      .locator(":scope > div")
      .first();
    await expect(firstChoice).toBeVisible();
    await firstChoice.click();
    await expect(page.getByRole("button", { name: "释义" })).toBeVisible();
    await familiarAction.click();
    await expect(
      page.getByText("今日学习已完成", { exact: true }),
    ).toBeVisible();

    const todayResponse = await page.request.get("/api/v1/study/today");
    expect(todayResponse.ok()).toBeTruthy();
    const today = (await todayResponse.json()) as {
      items?: Array<{ completedAt?: string | null }>;
    };
    expect(today.items).toHaveLength(1);
    expect(today.items?.[0]?.completedAt).not.toBeNull();

    const statsResponse = await page.request.get("/api/v1/study/stats");
    expect(statsResponse.ok()).toBeTruthy();
    const stats = (await statsResponse.json()) as { reviews?: number };
    expect(stats.reviews).toBe(1);
  },
);

test(
  "LEGACY-LEARNER-008-E2E the original profile edits avatar, nickname, password, and logs out",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ learnerPage: page, namespace }) => {
    const account = await registerUserViaApi(page, namespace, "legacy-profile");
    await page.goto("/profile");

    const avatarInput = page.locator('input[type="file"]');
    await avatarInput.setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      page.locator('div[class*="avatarContainer"] img'),
    ).toHaveAttribute("src", /^data:image\/png;base64,/);

    const nickname = `旧版用户 ${namespace.value}`;
    await page.getByText("修改昵称", { exact: true }).click();
    const nicknameEditor = page
      .locator('div[class*="editCard"]')
      .filter({ hasText: "编辑昵称" });
    await nicknameEditor.getByPlaceholder("请输入昵称").fill(nickname);
    await nicknameEditor.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByRole("heading", { name: nickname })).toBeVisible();
    await expect(
      page.request.get("/api/v1/users/me").then((value) => value.json()),
    ).resolves.toMatchObject({ displayName: nickname });

    const nextPassword = `Legacy-${namespace.value}-Bb2!`;
    await page.getByText("修改密码", { exact: true }).click();
    await page.getByPlaceholder("请输入当前密码").fill(account.password);
    await page.getByPlaceholder("请输入新密码（至少6位）").fill(nextPassword);
    await page.getByPlaceholder("请再次输入新密码").fill(nextPassword);
    await page.getByRole("button", { name: "确认修改" }).click();
    await expect(page.getByText("密码修改成功", { exact: true })).toBeVisible();

    await page.getByText("退出登录", { exact: true }).click();
    await page.getByRole("button", { name: "确定退出" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await loginUserThroughUi(page, {
      email: account.email,
      password: nextPassword,
    });
  },
);

test(
  "LEGACY-LEARNER-011-E2E unfinished recitation progress resumes across browsers",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ browser, learnerPage: page, namespace }) => {
    const account = await registerUserViaApi(
      page,
      namespace,
      "legacy-practice-resume",
    );
    await page.addInitScript(() => {
      Math.random = () => 0.9;
    });

    const book = await firstBook(page);
    const editionId = book.editions?.[0]?.id;
    expect(editionId).toBeTruthy();
    const enrollment = await page.request.post("/api/v1/study/enrollments", {
      data: {
        bookId: book.id,
        editionId,
        dailyNewLimit: 1,
      },
      headers: await authenticatedMutationHeaders(page),
    });
    expect(
      enrollment.ok() || enrollment.status() === 409,
      `enrollment failed with status ${enrollment.status()}`,
    ).toBeTruthy();

    await page.goto(`/vocabulary-practice?bookId=${book.id}&type=new`);
    await page.getByText("不认识", { exact: true }).click();
    await expect(page.getByRole("button", { name: "释义" })).toBeVisible();
    await page
      .locator('div[class*="headerActions"]')
      .getByText("熟", { exact: true })
      .click();
    const firstChoice = page
      .locator('div[class*="optionsContainer"]')
      .locator(":scope > div")
      .first();
    await expect(firstChoice).toBeVisible();
    await firstChoice.click();
    await expect(page.getByRole("button", { name: "释义" })).toBeVisible();

    const firstTodayResponse = await page.request.get("/api/v1/study/today");
    expect(firstTodayResponse.ok()).toBeTruthy();
    const firstToday = (await firstTodayResponse.json()) as {
      items?: Array<{
        recognitionDecision?: string;
        correctStreak?: number;
        requiredCorrectCount?: number;
        completedAt?: string | null;
      }>;
    };
    expect(firstToday.items).toHaveLength(1);
    expect(firstToday.items?.[0]).toMatchObject({
      recognitionDecision: "NOT_RECOGNIZED",
      correctStreak: 1,
      requiredCorrectCount: 3,
      completedAt: null,
    });

    const secondContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    try {
      const secondPage = await secondContext.newPage();
      await secondPage.addInitScript(() => {
        Math.random = () => 0.9;
      });
      await loginUserThroughUi(secondPage, account);
      await secondPage.goto(`/vocabulary-practice?bookId=${book.id}&type=new`);

      await expect(
        secondPage
          .locator('div[class*="optionsContainer"]')
          .locator(":scope > div")
          .first(),
      ).toBeVisible();
      await expect(secondPage.getByText("不认识", { exact: true })).toHaveCount(
        0,
      );
      await expect(secondPage.getByText("认识", { exact: true })).toHaveCount(
        0,
      );
    } finally {
      await secondContext.close();
    }
  },
);

test(
  "LEGACY-LEARNER-009-E2E the original email and avatar persist across browsers",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ browser, learnerPage: page, namespace }) => {
    const account = await registerUserViaApi(
      page,
      namespace,
      "legacy-profile-persisted",
    );
    await page.goto("/profile");

    await page.locator('input[type="file"]').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    const avatar = page.locator('div[class*="avatarContainer"] img');
    await expect(avatar).toHaveAttribute("src", /^data:image\/png;base64,/);

    const nextEmail = `updated+${namespace.value}@sylis.test`;
    await page.getByText("修改邮箱", { exact: true }).click();
    const emailEditor = page
      .locator('div[class*="editCard"]')
      .filter({ hasText: "编辑邮箱" });
    await emailEditor.getByPlaceholder("请输入邮箱地址").fill(nextEmail);
    await emailEditor.getByRole("button", { name: /保存/ }).click();
    await expect(
      page.getByText(nextEmail, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.request.get("/api/v1/users/me").then((value) => value.json()),
    ).resolves.toMatchObject({ email: nextEmail });

    const secondContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    try {
      const secondPage = await secondContext.newPage();
      // Emulate CI load so login must await the page's own auth readiness.
      await secondPage.route(
        "**/api/v1/auth/session",
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 250));
          await route.continue();
        },
        { times: 1 },
      );
      await loginUserThroughUi(secondPage, {
        email: nextEmail,
        password: account.password,
      });
      await secondPage.goto("/profile");
      await expect(
        secondPage.locator('div[class*="avatarContainer"] img'),
      ).toHaveAttribute("src", /^data:image\/png;base64,/);
    } finally {
      await secondContext.close();
    }
  },
);

test(
  "LEGACY-LEARNER-010-E2E the original Reddit search, detail, save, and history flow persists",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ browser, learnerPage: page, namespace }) => {
    const account = await registerUserViaApi(page, namespace, "legacy-reddit");
    const feedResponse = await page.request.get("/api/v1/explore/reddit/feed");
    expect(feedResponse.ok()).toBeTruthy();
    const feed = (await feedResponse.json()) as Array<{
      postId: string;
      subreddit: string;
      document: {
        id: string;
        currentRevision: { id: string; title: string } | null;
      };
    }>;
    const firstPost = feed.find((item) => item.document.currentRevision);
    expect(firstPost).toBeTruthy();
    const title = firstPost!.document.currentRevision!.title;

    await page.goto("/reddit");
    await page.getByText("New", { exact: true }).click();
    await expect(
      page
        .locator('div[class*="sortOption"][class*="active"]')
        .getByText("New", { exact: true }),
    ).toBeVisible();
    const search = page.getByPlaceholder("搜索帖子、话题...");
    await search.fill(title);
    await search.press("Enter");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("heading", { name: title }).click();
    await expect(page).toHaveURL(
      new RegExp(`/reddit/post/${firstPost!.postId}$`),
    );
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const markAsRead = page.getByRole("button", {
      name: "Mark as Read",
      exact: true,
    });
    await markAsRead.click();
    await expect(markAsRead).toHaveCount(0);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Unsave", exact: true }),
    ).toBeVisible();

    const libraryResponse = await page.request.get(
      "/api/v1/reading/collections/library/items",
    );
    expect(libraryResponse.ok()).toBeTruthy();
    expect(await libraryResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: firstPost!.document.id,
          document: expect.objectContaining({
            origin: expect.objectContaining({ kind: "REDDIT" }),
          }),
        }),
      ]),
    );
    const historyResponse = await page.request.get("/api/v1/reading/history");
    expect(historyResponse.ok()).toBeTruthy();
    expect(await historyResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: firstPost!.document.id,
          revisionId: firstPost!.document.currentRevision!.id,
          progress: 1,
          eventVersion: 1,
        }),
      ]),
    );

    await page.goto("/reddit/saved");
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.goto("/reddit/history");
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const secondContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    try {
      const secondPage = await secondContext.newPage();
      await loginUserThroughUi(secondPage, account);
      await secondPage.goto("/reddit/saved");
      await expect(secondPage.getByText(title, { exact: true })).toBeVisible();
      await secondPage.getByText(title, { exact: true }).click();
      const unsaveResponsePromise = secondPage.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          response.url().includes("/api/v1/reading/collections/library/items/"),
      );
      await secondPage
        .getByRole("button", { name: "Unsave", exact: true })
        .click();
      const unsaveResponse = await unsaveResponsePromise;
      expect(unsaveResponse.ok()).toBeTruthy();
      await expect(
        secondPage.getByRole("button", { name: "Save", exact: true }),
      ).toBeVisible();
      await secondPage.goto("/reddit/saved");
      await expect(secondPage.getByText(title, { exact: true })).toHaveCount(0);
      await secondPage.goto("/reddit/history");
      await expect(secondPage.getByText(title, { exact: true })).toBeVisible();
    } finally {
      await secondContext.close();
    }
  },
);

async function firstBook(
  page: Page,
): Promise<BookListEnvelope["data"][number]> {
  const response = await page.request.get("/api/v1/vocabulary-books");
  expect(response.ok()).toBeTruthy();
  const envelope = (await response.json()) as BookListEnvelope;
  expect(envelope.data.length).toBeGreaterThan(0);
  return envelope.data[0]!;
}

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400) {
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
