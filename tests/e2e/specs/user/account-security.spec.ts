import {
  ConsentDataCategory,
  ConsentDecision,
  ConsentPurpose,
} from "@sylis/api-client/user";

import {
  authenticatedMutationHeaders,
  loginUserThroughUi,
  registerUser,
  registerUserViaApi,
} from "../../fixtures/accounts";
import { deliveredVerificationToken } from "../../fixtures/api-setup";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2ePorts, e2eTags } from "../../runtime";

interface AuthSessionEnvelope {
  session: { id: string };
}

interface AuthSessionListItem {
  id: string;
  revokedAt: string | null;
}

test(
  "IDENTITY-002-E2E a user controls profile, consent, and client sessions",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ browser, learnerAccount: credentials, learnerPage: page }) => {
    const primaryHeaders = await authenticatedMutationHeaders(page);

    const profileResponse = await page.request.patch("/api/v1/users/me", {
      headers: primaryHeaders,
      data: { locale: "zh-CN", timezone: "Asia/Shanghai" },
    });
    expect(profileResponse.ok()).toBeTruthy();
    await expect(profileResponse.json()).resolves.toMatchObject({
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
    });

    const consent = {
      purpose: ConsentPurpose.OPTIONAL_MODEL_EXCHANGE,
      categories: [
        ConsentDataCategory.MODEL_INPUT,
        ConsentDataCategory.MODEL_OUTPUT,
      ],
      policyVersion: "e2e-identity-v1",
      decision: ConsentDecision.GRANTED,
    };
    const consentResponse = await page.request.post(
      "/api/v1/users/me/consent-records",
      { headers: primaryHeaders, data: consent },
    );
    expect(consentResponse.ok()).toBeTruthy();
    await expect(consentResponse.json()).resolves.toMatchObject(consent);

    const consentsResponse = await page.request.get(
      "/api/v1/users/me/consents",
    );
    expect(consentsResponse.ok()).toBeTruthy();
    await expect(consentsResponse.json()).resolves.toContainEqual(
      expect.objectContaining(consent),
    );

    const primarySessionResponse = await page.request.get(
      "/api/v1/auth/session",
    );
    expect(primarySessionResponse.ok()).toBeTruthy();
    const primarySession =
      (await primarySessionResponse.json()) as AuthSessionEnvelope;

    const secondContext = await browser.newContext({
      baseURL: `http://127.0.0.1:${e2ePorts().web}`,
    });
    try {
      const secondPage = await secondContext.newPage();
      await loginUserThroughUi(secondPage, credentials);

      const secondSessionResponse = await secondPage.request.get(
        "/api/v1/auth/session",
      );
      expect(secondSessionResponse.ok()).toBeTruthy();
      const secondSession =
        (await secondSessionResponse.json()) as AuthSessionEnvelope;
      expect(secondSession.session.id).not.toBe(primarySession.session.id);

      const sessionsResponse = await page.request.get(
        "/api/v1/users/me/sessions",
      );
      expect(sessionsResponse.ok()).toBeTruthy();
      const sessions = (await sessionsResponse.json()) as AuthSessionListItem[];
      expect(sessions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: primarySession.session.id,
            revokedAt: null,
          }),
          expect.objectContaining({
            id: secondSession.session.id,
            revokedAt: null,
          }),
        ]),
      );

      const revokeResponse = await page.request.delete(
        `/api/v1/users/me/sessions/${secondSession.session.id}`,
        { headers: primaryHeaders },
      );
      expect(revokeResponse.status()).toBe(204);
      expect(
        (await secondPage.request.get("/api/v1/auth/session")).status(),
      ).toBe(401);
      expect(
        (await page.request.get("/api/v1/auth/session")).ok(),
      ).toBeTruthy();
    } finally {
      await secondContext.close();
    }

    const logoutResponse = await page.request.delete("/api/v1/auth/session", {
      headers: primaryHeaders,
    });
    expect(logoutResponse.status()).toBe(204);
    expect((await page.request.get("/api/v1/auth/session")).status()).toBe(401);

    await page.goto("/me");
    await expect(page).toHaveURL(/\/login(?:$|\?)/);
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  },
);

test(
  "IDENTITY-003-E2E a new login never renders the previous user's Agent cache",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ page }, testInfo) => {
    await registerUser(page, testInfo, "cache-owner");
    const headers = await authenticatedMutationHeaders(page);
    const previousTitle = `Private session ${testInfo.testId}`;
    const created = await page.request.post("/api/agent/v1/sessions", {
      headers,
      data: { title: previousTitle },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto("/agent");
    await page.getByRole("button", { name: "打开会话历史" }).click();
    await expect(page.getByText(previousTitle, { exact: true })).toBeVisible();
    await page.goto("/me/settings");
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/login(?:$|\?)/);

    await registerUser(page, testInfo, "cache-successor");
    let releaseSessions!: () => void;
    const sessionsGate = new Promise<void>((resolve) => {
      releaseSessions = resolve;
    });
    await page.route("**/api/agent/v1/sessions", async (route) => {
      await sessionsGate;
      await route.continue();
    });

    await page.goto("/agent");
    await page.getByRole("button", { name: "打开会话历史" }).click();
    await expect(page.getByText(previousTitle, { exact: true })).toHaveCount(0);
    releaseSessions();
    await expect(page.getByText("还没有会话", { exact: true })).toBeVisible();
    await page.unroute("**/api/agent/v1/sessions");
  },
);

test(
  "IDENTITY-004-E2E a learner recovers an account and invalidates every old session",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ browser, page, namespace }) => {
    const account = await registerUserViaApi(page, namespace, "recovery");
    expect((await page.request.get("/api/v1/auth/session")).ok()).toBeTruthy();

    const secondContext = await browser.newContext({
      baseURL: `http://127.0.0.1:${e2ePorts().web}`,
    });
    try {
      const secondPage = await secondContext.newPage();
      await loginUserThroughUi(secondPage, account);

      await page.goto("/recover");
      await page.getByLabel("邮箱").fill(account.email);
      await page.getByRole("button", { name: "发送恢复邮件" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "恢复邮件已经发送" }),
      ).toBeVisible();

      const token = await deliveredVerificationToken(account.email);
      const nextPassword = `Recovered-${namespace.value}-Aa1!`;
      await page.goto(`/recover?token=${encodeURIComponent(token)}`);
      await page.getByLabel(/^新密码/).fill(nextPassword);
      await page.getByLabel("确认新密码").fill(nextPassword);
      await page.getByRole("button", { name: "更新密码" }).click();
      await expect(page).toHaveURL(/\/login\?password-reset=1$/);
      await expect(page.getByRole("status")).toContainText("密码已更新");

      expect((await page.request.get("/api/v1/auth/session")).status()).toBe(
        401,
      );
      expect(
        (await secondPage.request.get("/api/v1/auth/session")).status(),
      ).toBe(401);
      expect(
        (
          await page.request.post("/api/v1/auth/sessions", {
            data: { email: account.email, password: account.password },
          })
        ).status(),
      ).toBe(401);

      await loginUserThroughUi(page, {
        email: account.email,
        password: nextPassword,
      });
    } finally {
      await secondContext.close();
    }
  },
);

test(
  "IDENTITY-005-E2E a learner updates profile and consent then revokes another session and logs out",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ browser, page, namespace }) => {
    const account = await registerUserViaApi(
      page,
      namespace,
      "account-controls",
    );
    await page.goto("/me/settings");
    await page.getByLabel("界面语言").selectOption("en");
    await page.getByLabel("时区").fill("UTC");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("status")).toHaveText("设置已保存");
    await expect(
      page.request.get("/api/v1/users/me").then((value) => value.json()),
    ).resolves.toMatchObject({
      locale: "en",
      timezone: "UTC",
    });

    await page.goto("/me/consents");
    const consentRow = page
      .locator(".sy-data-list__row")
      .filter({ hasText: ConsentPurpose.OPTIONAL_MODEL_EXCHANGE });
    await consentRow.getByRole("button", { name: "授权" }).click();
    await expect(consentRow).toContainText("已授权");

    const secondUserAgent = `Sylis E2E secondary ${namespace.value}`;
    const secondContext = await browser.newContext({
      baseURL: `http://127.0.0.1:${e2ePorts().web}`,
      userAgent: secondUserAgent,
    });
    try {
      const secondPage = await secondContext.newPage();
      await loginUserThroughUi(secondPage, account);

      await page.goto("/me/sessions");
      await page
        .locator(".sy-data-list__row")
        .filter({ hasText: secondUserAgent })
        .getByRole("button", { name: "撤销" })
        .click();
      await expect
        .poll(async () =>
          (await secondPage.request.get("/api/v1/auth/session")).status(),
        )
        .toBe(401);
    } finally {
      await secondContext.close();
    }

    await page.goto("/me/settings");
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/login(?:$|\?)/);
  },
);

test(
  "IDENTITY-006-E2E a learner adds rotates and revokes a masked BYOK credential",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ page, namespace }) => {
    const account = await registerUserViaApi(page, namespace, "byok");
    const label = `E2E BYOK ${namespace.value}`;
    const firstSecret = `sk-e2e-${namespace.value}-1111`;
    const nextSecret = `sk-e2e-${namespace.value}-2222`;
    await page.goto("/me/agent");
    const modelCredentials = page
      .getByRole("heading", { name: "模型凭证" })
      .locator("..");
    await modelCredentials.getByLabel("账户密码").fill(account.password);
    await modelCredentials.getByRole("button", { name: "验证身份" }).click();
    await expect(page.getByText("身份已验证", { exact: true })).toBeVisible();

    await page.getByLabel("名称").fill(label);
    await page.getByLabel("密钥", { exact: true }).fill(firstSecret);
    await page.getByRole("button", { name: "添加" }).click();
    const credential = page.locator(".byok-row").filter({ hasText: label });
    await expect(credential).toContainText("****1111");
    await expect(page.getByText(firstSecret, { exact: true })).toHaveCount(0);

    await credential.getByRole("button", { name: "轮换" }).click();
    await page.getByLabel("新密钥").fill(nextSecret);
    await page
      .locator("form.byok-editor")
      .getByRole("button", { name: "轮换" })
      .click();
    await expect(credential).toContainText("revision 2");
    await expect(credential).toContainText("****2222");
    await expect(page.getByText(nextSecret, { exact: true })).toHaveCount(0);

    await credential.getByRole("button", { name: "撤销" }).click();
    await expect(credential).toContainText("已撤销");
  },
);
