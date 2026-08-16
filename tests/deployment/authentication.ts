import { expect, type Page } from "@playwright/test";

import {
  DeploymentEnvironmentVariable,
  requiredDeploymentEnvironment,
  totp,
} from "./runtime";

export async function loginSyntheticUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page
    .getByLabel("邮箱")
    .fill(
      requiredDeploymentEnvironment(DeploymentEnvironmentVariable.USER_EMAIL),
    );
  await page
    .getByLabel("密码")
    .fill(
      requiredDeploymentEnvironment(
        DeploymentEnvironmentVariable.USER_PASSWORD,
      ),
    );
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/study(?:$|\?)/);
}

export async function loginSyntheticAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page
    .getByLabel("邮箱")
    .fill(
      requiredDeploymentEnvironment(DeploymentEnvironmentVariable.ADMIN_EMAIL),
    );
  await page
    .getByLabel("密码")
    .fill(
      requiredDeploymentEnvironment(
        DeploymentEnvironmentVariable.ADMIN_PASSWORD,
      ),
    );
  await page.getByRole("button", { name: "继续" }).click();
  await expect(page.getByLabel("TOTP 验证码")).toBeVisible();
  await page
    .getByLabel("TOTP 验证码")
    .fill(
      totp(
        requiredDeploymentEnvironment(
          DeploymentEnvironmentVariable.ADMIN_TOTP_SECRET,
        ),
      ),
    );
  await page.getByRole("button", { name: "验证并登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}
