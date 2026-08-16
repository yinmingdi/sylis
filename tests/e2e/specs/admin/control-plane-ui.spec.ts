import {
  AgentReleaseCommandKind,
  ModelPolicyScopeKind,
  ModelPurposeKind,
} from "@sylis/api-client/admin";
import { CapabilityKey } from "@sylis/agent-contracts";
import {
  AgentEvaluationStatus,
  JobStatus,
  OperatorRole,
  SourceDatasetVersionStatus,
} from "@sylis/database";
import { DataExportCategory } from "@sylis/job-contracts";
import type { Locator, Page } from "@playwright/test";

import {
  authenticatedMutationHeaders,
  registerUserViaApi,
} from "../../fixtures/accounts";
import { totp } from "../../fixtures/api-setup";
import {
  adminUrl,
  loginOperator,
  operatorMutationHeaders,
  reauthenticateOperator,
} from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import {
  e2eOperatorCredentials,
  e2eRoleOperatorCredentials,
  TestTag,
  e2eTags,
} from "../../runtime";

const roleNavigation: Record<
  OperatorRole,
  { allowed: string; denied: string }
> = {
  [OperatorRole.SUPPORT]: { allowed: "User Support", denied: "Audit" },
  [OperatorRole.CONTENT_REVIEWER]: {
    allowed: "Review Center",
    denied: "Audit",
  },
  [OperatorRole.LEXICON_OPERATOR]: { allowed: "Sources", denied: "Audit" },
  [OperatorRole.RELEASE_MANAGER]: { allowed: "Releases", denied: "Audit" },
  [OperatorRole.MODEL_OPERATOR]: { allowed: "Credentials", denied: "Audit" },
  [OperatorRole.AGENT_RELEASE_MANAGER]: {
    allowed: "Agent Releases",
    denied: "Audit",
  },
  [OperatorRole.SECURITY_ADMIN]: { allowed: "Audit", denied: "Sources" },
};

for (const role of Object.values(OperatorRole)) {
  test(
    `ADMIN-006-E2E ${role} completes MFA and sees only role-allowed navigation`,
    {
      tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
    },
    async ({ page }) => {
      await loginOperator(page, role);
      const navigation = page.getByRole("navigation", {
        name: "Admin navigation",
      });
      await expect(
        navigation.getByRole("link", { name: roleNavigation[role].allowed }),
      ).toBeVisible();
      await expect(
        navigation.getByRole("link", { name: roleNavigation[role].denied }),
      ).toHaveCount(0);
    },
  );
}

test(
  "ADMIN-007-E2E an operator creates and rotates a masked credential",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ page, namespace }) => {
    await loginOperator(page);

    const label = `E2E credential ${namespace.value}`;
    const createReason = `Create credential ${namespace.value}`;
    await page.goto(adminUrl("/models/credentials"));
    await expect(
      page.getByRole("heading", { name: "Credentials" }),
    ).toBeVisible();
    const createForm = page.locator("form.admin-command");
    await createForm.getByLabel("Label").fill(label);
    await createForm
      .getByLabel("Secret")
      .fill(`fake-initial-${namespace.value}`);
    await createForm.getByLabel("Reason").fill(createReason);
    await reauthenticateThroughUi(createForm);
    await createForm.getByRole("button", { name: "创建凭据" }).click();

    const credential = dataRow(page, label);
    await expect(credential).toBeVisible();
    await expect(credential).not.toContainText(
      `fake-initial-${namespace.value}`,
    );
    const initialDetail = await credential.locator("small").innerText();
    await credential.getByRole("button", { name: "轮换" }).click();
    const rotation = page.locator("section.admin-risk-command").filter({
      has: page.getByRole("heading", { name: "ROTATE Credential" }),
    });
    await rotation
      .getByLabel("New secret")
      .fill(`fake-rotated-${namespace.value}`);
    await rotation
      .getByLabel("Reason")
      .fill(`Rotate credential ${namespace.value}`);
    await reauthenticateThroughUi(rotation);
    await rotation.getByRole("button", { name: "执行", exact: true }).click();
    await expect(credential.locator("small")).not.toHaveText(initialDetail);
    await expect(credential).not.toContainText(
      `fake-rotated-${namespace.value}`,
    );
  },
);

test(
  "ADMIN-012-E2E an operator creates user-scoped budget and quota policies",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ page, learnerPage, namespace }) => {
    const learnerSession = await learnerPage.request.get(
      "/api/v1/auth/session",
    );
    expect(learnerSession.ok()).toBeTruthy();
    const learner = (await learnerSession.json()) as {
      actor: { id: string };
    };
    await loginOperator(page);

    await page.goto(adminUrl("/models/usage"));
    await expect(page.getByRole("heading", { name: "AI Usage" })).toBeVisible();
    const policy = page.getByRole("main");
    const budgets = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Budgets" }),
    });
    const quotas = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Quotas" }),
    });
    const budgetCount = await budgets.locator(".sy-data-list__row").count();
    const quotaCount = await quotas.locator(".sy-data-list__row").count();
    await policy
      .getByRole("combobox", { name: "Scope", exact: true })
      .selectOption(ModelPolicyScopeKind.USER);
    await policy
      .getByRole("textbox", { name: "Scope ID", exact: true })
      .fill(learner.actor.id);
    await policy
      .getByRole("combobox", { name: "Purpose", exact: true })
      .selectOption(ModelPurposeKind.AGENT_RUN);
    await policy
      .getByRole("textbox", { name: "Policy version", exact: true })
      .fill(`e2e-policy/${namespace.value}`);
    await policy
      .getByRole("textbox", { name: "Reason", exact: true })
      .fill(`Scoped budget ${namespace.value}`);
    await reauthenticateThroughUi(policy);
    await policy.getByRole("button", { name: "创建预算策略" }).click();
    await expect(budgets.locator(".sy-data-list__row")).toHaveCount(
      budgetCount + 1,
    );
    await policy.getByRole("button", { name: "创建配额策略" }).click();
    await expect(quotas.locator(".sy-data-list__row")).toHaveCount(
      quotaCount + 1,
    );
  },
);

test(
  "ADMIN-008-E2E an operator previews and schedules an Agent evaluation through the UI",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ page, namespace }) => {
    await loginOperator(page);
    await page.goto(adminUrl("/agent/releases?kind=CAPABILITY"));
    await expect(
      page.getByRole("heading", { name: "Agent Releases" }),
    ).toBeVisible();
    const release = dataRow(page, CapabilityKey.LEXICON_EXPLAIN);
    await release.getByRole("button", { name: "管理" }).click();

    const command = page.locator("section.admin-agent-command");
    await command
      .getByLabel("动作")
      .selectOption(AgentReleaseCommandKind.EVALUATE);
    await command
      .getByLabel("原因")
      .fill(`Evaluate release ${namespace.value}`);
    await command.getByLabel("Eval Release").selectOption({ index: 1 });
    const evaluations = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Evaluations" }),
    });
    const initialCount = await evaluations
      .locator(".sy-data-list__row")
      .count();
    await command.getByRole("button", { name: "生成预览" }).click();
    await expect(command.getByText("动作摘要", { exact: true })).toBeVisible();
    await reauthenticateThroughUi(command);
    await command
      .getByRole("button", {
        name: `执行 ${AgentReleaseCommandKind.EVALUATE}`,
      })
      .click();
    await expect(evaluations.locator(".sy-data-list__row")).toHaveCount(
      initialCount + 1,
    );
    const scheduledEvaluation = evaluations
      .locator(".sy-data-list__row")
      .first();
    await expect(scheduledEvaluation).toContainText(
      new RegExp(
        [
          AgentEvaluationStatus.QUEUED,
          AgentEvaluationStatus.RUNNING,
          AgentEvaluationStatus.SUCCEEDED,
        ].join("|"),
      ),
    );
  },
);

test(
  "ADMIN-009-E2E an operator cancels and retries background jobs through the UI",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ page, learnerPage, namespace }) => {
    test.slow();
    await loginOperator(page);
    const userHeaders = await authenticatedMutationHeaders(learnerPage);
    const exportResponse = await learnerPage.request.post(
      "/api/v1/users/me/data-exports",
      {
        headers: {
          ...userHeaders,
          "Idempotency-Key": namespace.idempotencyKey("ui-job-cancel"),
        },
        data: { scope: [DataExportCategory.PROFILE] },
      },
    );
    expect(exportResponse.ok()).toBeTruthy();
    const dataExport = (await exportResponse.json()) as { jobId: string };
    await expectJobStatus(page, dataExport.jobId, JobStatus.RUNNING);

    await page.goto(adminUrl("/jobs"));
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
    const runningJob = dataRow(page, dataExport.jobId);
    await runningJob.getByRole("button", { name: "取消" }).click();
    const cancellation = riskCommand(page, "取消 Job");
    await cancellation
      .getByLabel("原因")
      .fill(`Cancel export ${namespace.value}`);
    await reauthenticateThroughUi(cancellation);
    await cancellation.getByRole("button", { name: "确认取消" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: dataExport.jobId }),
    ).toContainText("任务已取消");
    await expectJobStatus(page, dataExport.jobId, JobStatus.CANCELLED, 30_000);
    await page.reload();
    await expect(dataRow(page, dataExport.jobId)).toContainText(
      JobStatus.CANCELLED,
    );

    await reauthenticateOperator(page);
    const failedJobId = await createFailedSourceJob(page, namespace.value);
    await expectJobStatus(page, failedJobId, JobStatus.FAILED);
    await page.goto(adminUrl("/jobs"));
    const failedJob = dataRow(page, failedJobId);
    await failedJob.getByRole("button", { name: "重试" }).click();
    const retry = riskCommand(page, "重试 Job");
    await retry.getByLabel("原因").fill(`Retry source ${namespace.value}`);
    await reauthenticateThroughUi(retry);
    await retry.getByRole("button", { name: "确认重试" }).click();
    const retryResult = page
      .getByRole("status")
      .filter({ hasText: "重试任务已创建" });
    await expect(retryResult).toBeVisible();
    await expect(retryResult).not.toContainText(failedJobId);
  },
);

test(
  "ADMIN-010-E2E a learner grants revokes and blocks diagnostic support access",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ page, learnerPage, learnerAccount, namespace }) => {
    test.slow();
    const supportCredentials = e2eRoleOperatorCredentials(OperatorRole.SUPPORT);
    await loginOperator(page, OperatorRole.SUPPORT);
    const supportSession = await page.request.get(
      adminUrl("/api/admin/v1/auth/session"),
    );
    expect(supportSession.ok()).toBeTruthy();
    const support = (await supportSession.json()) as { actor: { id: string } };

    await learnerPage.goto("/agent");
    await learnerPage.getByRole("button", { name: "AI 对话" }).click();
    await learnerPage.getByLabel("能力").selectOption({ label: "学习问答" });
    await learnerPage
      .getByLabel("给 Agent 的消息")
      .fill(`Support diagnosis ${namespace.value}`);
    await learnerPage
      .getByRole("button", { name: "发送", exact: true })
      .click();
    await expect(
      learnerPage.getByText("执行完成", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    await learnerPage.goto("/me/agent");
    const diagnostics = learnerPage.locator(".diagnostic-support");
    await expect(
      learnerPage.getByRole("heading", { name: "诊断与支持" }),
    ).toBeVisible();
    await diagnostics.getByRole("checkbox").first().check();
    await diagnostics.getByRole("button", { name: "创建诊断包" }).click();
    await expect(
      diagnostics.getByText("Revision 1", { exact: true }),
    ).toBeVisible();
    await diagnostics.getByRole("button", { name: "确认内容" }).click();
    await expect(
      diagnostics.getByText("已确认", { exact: true }),
    ).toBeVisible();

    const grantPurpose = `Support grant ${namespace.value}`;
    const grantEditor = diagnostics.locator(".support-grant-management");
    await grantEditor.getByLabel("账户密码").fill(learnerAccount.password);
    await grantEditor.getByRole("button", { name: "验证身份" }).click();
    await grantEditor.getByLabel("Support 用户 ID").fill(support.actor.id);
    await grantEditor.getByLabel("用途说明").fill(grantPurpose);
    await expect(
      grantEditor.getByRole("button", { name: "预览授权" }),
    ).toBeEnabled();
    await grantEditor.getByRole("button", { name: "预览授权" }).click();
    await expect(
      grantEditor.locator(".support-grant-preview code"),
    ).toBeVisible();
    await grantEditor.getByRole("button", { name: "确认授权" }).click();
    const activeGrant = grantEditor
      .locator(".support-grant-list > div")
      .filter({ hasText: grantPurpose });
    await expect(activeGrant).toContainText("有效");

    const grantsResponse = await learnerPage.request.get(
      "/api/v1/users/me/support-grants",
    );
    expect(grantsResponse.ok()).toBeTruthy();
    const grants = (await grantsResponse.json()) as Array<{
      id: string;
      purposeDetails: string;
    }>;
    const grantId = grants.find(
      ({ purposeDetails }) => purposeDetails === grantPurpose,
    )?.id;
    expect(grantId).toBeTruthy();

    await page.goto(adminUrl("/users/support"));
    const controlledAccess = riskCommand(page, "受控支持访问");
    const firstRequestId = crypto.randomUUID();
    await controlledAccess.getByLabel("Support grant ID").fill(grantId!);
    await controlledAccess.getByLabel("Request ID").fill(firstRequestId);
    await reauthenticateThroughUi(controlledAccess, supportCredentials);
    await controlledAccess.getByRole("button", { name: "使用授权" }).click();
    const supportResult = page.locator("section.admin-support-result");
    await expect(supportResult).toContainText(grantId!);
    await expect(supportResult).toContainText(firstRequestId);

    await learnerPage.goto("/me/agent");
    await learnerPage
      .getByRole("button", { name: /^Bundle / })
      .first()
      .click();
    const persistedGrant = learnerPage
      .locator(".support-grant-list > div")
      .filter({ hasText: grantPurpose });
    await grantEditor.getByLabel("账户密码").fill(learnerAccount.password);
    await grantEditor.getByRole("button", { name: "验证身份" }).click();
    await persistedGrant.getByRole("button", { name: "撤销" }).click();
    await expect(persistedGrant).toContainText("已撤销");

    await controlledAccess.getByLabel("Request ID").fill(crypto.randomUUID());
    await controlledAccess.getByRole("button", { name: "使用授权" }).click();
    await expect(controlledAccess.locator(".form-error")).toBeVisible();
  },
);

test(
  "ADMIN-011-E2E a learner exports data deletes the account and leaves visible audit evidence",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ page, learnerPage, namespace }) => {
    test.slow();
    const account = await registerUserViaApi(
      learnerPage,
      namespace,
      "data-governance",
    );
    const sessionResponse = await learnerPage.request.get(
      "/api/v1/auth/session",
    );
    expect(sessionResponse.ok()).toBeTruthy();
    const learner = (await sessionResponse.json()) as { actor: { id: string } };

    await learnerPage.goto("/me/data");
    await learnerPage.getByRole("button", { name: "创建导出" }).click();
    await expect(
      learnerPage.getByRole("button", { name: "下载 JSON" }),
    ).toBeVisible({ timeout: 30_000 });
    await learnerPage.getByRole("button", { name: "删除账号和数据" }).click();
    await learnerPage.getByLabel("当前密码").fill(account.password);
    await learnerPage.getByRole("button", { name: "确认删除" }).click();
    await expect(learnerPage).toHaveURL(/\/login$/);

    await loginOperator(page, OperatorRole.SECURITY_ADMIN);
    await page.goto(adminUrl("/security/audit"));
    await page.getByLabel("Action").fill("user.deletion-requested");
    await page.getByRole("button", { name: "查询" }).click();
    const auditEvent = dataRow(page, "user.deletion-requested").filter({
      hasText: learner.actor.id,
    });
    await expect(auditEvent).toBeVisible();
  },
);

async function reauthenticateThroughUi(
  scope: Locator,
  credentials = e2eOperatorCredentials(),
): Promise<void> {
  await scope.getByLabel("管理员密码").fill(credentials.password);
  await scope.getByLabel("TOTP").fill(totp(credentials.totpSecret));
  await scope.getByRole("button", { name: "TOTP 认证" }).click();
}

async function createFailedSourceJob(
  page: Page,
  namespace: string,
): Promise<string> {
  const headers = await operatorMutationHeaders(page);
  const identity = namespace.slice(0, 12);
  const registration = await page.request.post(
    adminUrl("/api/admin/v1/source-datasets/versions"),
    {
      headers,
      data: {
        datasetKey: `e2e-ui-retry-${identity}`,
        datasetName: "E2E UI retry source",
        homepageUri: "https://source-fixture/",
        version: "2026-08-10",
        sourceUri: "https://source-fixture/registered-source.csv",
        checksum: `sha256:${"0".repeat(64)}`,
        retrievedAt: new Date().toISOString(),
        adapter: "ecdict-csv",
        parserVersion: "e2e/1",
        schemaVersion: "ecdict-csv/1",
        validationSummary: { fixture: true, expectedFailure: true },
        status: SourceDatasetVersionStatus.VALIDATED,
        rights: {
          mayBuild: true,
          mayServe: true,
          mayExport: false,
          requiresAttribution: false,
          attribution: null,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveTo: null,
        },
      },
    },
  );
  expect(registration.ok()).toBeTruthy();
  const source = (await registration.json()) as { id: string };
  const synchronization = await page.request.post(
    adminUrl(
      `/api/admin/v1/source-datasets/versions/${source.id}/synchronizations`,
    ),
    {
      headers: {
        ...headers,
        "Idempotency-Key": `e2e-ui-retry-${identity}`,
      },
    },
  );
  expect(synchronization.ok()).toBeTruthy();
  return ((await synchronization.json()) as { jobId: string }).jobId;
}

async function expectJobStatus(
  page: Page,
  jobId: string,
  status: JobStatus,
  timeout = 20_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          adminUrl(`/api/admin/v1/jobs/${jobId}`),
        );
        if (!response.ok()) return null;
        return ((await response.json()) as { status: JobStatus }).status;
      },
      { timeout },
    )
    .toBe(status);
}

function riskCommand(page: Page, heading: string): Locator {
  return page
    .locator("section.admin-risk-command")
    .filter({ has: page.getByRole("heading", { name: heading }) });
}

function dataRow(page: Page, label: string): Locator {
  return page.locator(".sy-data-list__row").filter({ hasText: label });
}
