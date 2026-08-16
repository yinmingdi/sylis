import { expect, type Page } from "@playwright/test";

import { MfaCredentialKind, OperatorRole } from "@sylis/database";

import {
  e2eOperatorCredentials,
  e2ePorts,
  e2eRoleOperatorCredentials,
} from "../runtime";
import { totp } from "./api-setup";

export async function operatorMutationHeaders(
  page: Page,
): Promise<Record<string, string>> {
  const response = await page.request.get(
    adminUrl("/api/admin/v1/auth/session"),
  );
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()) as { csrfToken?: unknown };
  if (typeof session.csrfToken !== "string" || !session.csrfToken) {
    throw new Error("E2E_ADMIN_CSRF_TOKEN_NOT_FOUND");
  }
  return {
    Origin: adminOrigin(),
    "X-CSRF-Token": session.csrfToken,
  };
}

export async function loginOperator(
  page: Page,
  role?: OperatorRole,
): Promise<void> {
  const operator = role
    ? e2eRoleOperatorCredentials(role)
    : e2eOperatorCredentials();
  await page.goto(adminUrl("/login"));
  await page.getByLabel("邮箱").fill(operator.email);
  await page.getByLabel("密码").fill(operator.password);
  await page.getByRole("button", { name: "继续" }).click();
  await expect(page.getByLabel("TOTP 验证码")).toBeVisible();
  await page.getByLabel("TOTP 验证码").fill(totp(operator.totpSecret));
  await page.getByRole("button", { name: "验证并登录" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
}

export async function reauthenticateOperator(page: Page): Promise<void> {
  const operator = e2eOperatorCredentials();
  const headers = await operatorMutationHeaders(page);
  const challengeResponse = await page.request.post(
    adminUrl("/api/admin/v1/auth/session/reauthentication/challenges"),
    { headers, data: { password: operator.password } },
  );
  expect(challengeResponse.ok()).toBeTruthy();
  const challenge = (await challengeResponse.json()) as {
    challengeToken: string;
  };
  expect(challenge.challengeToken).toBeTruthy();

  const response = await page.request.post(
    adminUrl("/api/admin/v1/auth/session/reauthentication"),
    {
      headers,
      data: {
        challengeToken: challenge.challengeToken,
        method: MfaCredentialKind.TOTP,
        code: totp(operator.totpSecret),
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()) as {
    reAuthenticatedAt: string;
    validForSeconds: number;
  };
  expect(new Date(session.reAuthenticatedAt).getTime()).toBeLessThanOrEqual(
    Date.now(),
  );
  expect(session.validForSeconds).toBeGreaterThan(0);
}

export function adminUrl(path = "/"): string {
  return new URL(path, `${adminOrigin()}/`).toString();
}

function adminOrigin(): string {
  return `http://127.0.0.1:${e2ePorts().admin}`;
}
