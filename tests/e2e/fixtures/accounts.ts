import { expect, type Page, type TestInfo } from "@playwright/test";

import { e2ePorts } from "../runtime";
import { deliveredVerificationToken } from "./api-setup";
import { testNamespace, type E2eNamespace } from "./namespace";

export interface RegisteredUser {
  email: string;
  password: string;
}

export async function loginUserThroughUi(
  page: Page,
  user: RegisteredUser,
): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("请输入邮箱地址").fill(user.email);
  await page.getByPlaceholder("请输入密码").fill(user.password);
  const protectedSessionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/v1/auth/session"
    );
  });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:books|vocabulary-learning)(?:$|\?)/);
  expect((await protectedSessionResponse).ok()).toBeTruthy();
  await expect(
    page
      .getByText("词书选择", { exact: true })
      .or(page.getByText("学习统计", { exact: true }))
      .first(),
  ).toBeVisible();
}

export async function authenticatedMutationHeaders(
  page: Page,
): Promise<Record<string, string>> {
  const response = await page.request.get("/api/v1/auth/session");
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()) as { csrfToken?: unknown };
  if (typeof session.csrfToken !== "string" || !session.csrfToken) {
    throw new Error("E2E_CSRF_TOKEN_NOT_FOUND");
  }
  return {
    Origin: `http://127.0.0.1:${e2ePorts().web}`,
    "X-CSRF-Token": session.csrfToken,
  };
}

export async function registerUser(
  page: Page,
  testInfo: TestInfo,
  namespace?: string,
): Promise<RegisteredUser> {
  const testScope = testNamespace(testInfo);
  const identity = namespace
    ? `${testScope.value}-${testScope.idempotencyKey(namespace).slice(-8)}`
    : testScope.value;
  const email = `e2e+${identity}@sylis.test`;
  const password = `Sylis-e2e-${identity}-Aa1!`;
  await page.goto("/register");
  await page.getByPlaceholder("请输入邮箱地址").fill(email);
  await page.getByRole("button", { name: "获取验证码" }).click();

  const token = await deliveredVerificationToken(email);
  await page.getByPlaceholder("请输入验证码").fill(token);
  await page.getByPlaceholder("请输入密码").fill(password);
  await page.getByPlaceholder("请再次输入密码").fill(password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page).toHaveURL(/\/study(?:$|\?)/);
  return { email, password };
}

export async function registerUserViaApi(
  page: Page,
  namespace: E2eNamespace,
  discriminator: string,
): Promise<RegisteredUser> {
  const identity = `${discriminator}-${namespace.value}`;
  const email = `e2e+${identity}@sylis.test`;
  const password = `Sylis-e2e-${identity}-Aa1!`;
  const challenge = await page.request.post(
    "/api/v1/auth/registration-challenges",
    { data: { email } },
  );
  expect(challenge.ok()).toBeTruthy();
  const token = await deliveredVerificationToken(email);
  const registration = await page.request.post("/api/v1/auth/register", {
    data: {
      token,
      displayName: `E2E learner ${identity}`,
      password,
      timezone: "Asia/Shanghai",
    },
  });
  expect(
    registration.ok() || registration.status() === 409,
    `registration failed with status ${registration.status()}`,
  ).toBeTruthy();
  if (registration.status() === 409) {
    const session = await page.request.post("/api/v1/auth/sessions", {
      data: { email, password },
    });
    expect(
      session.ok(),
      `learner login failed with status ${session.status()}`,
    ).toBeTruthy();
  }
  return { email, password };
}
