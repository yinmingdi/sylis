import { createHash } from "node:crypto";

import { AssetMimeType } from "@sylis/agent-contracts";
import {
  ContentAssetPurpose,
  ContentAssetRevisionStatus,
  ContentAssetStatus,
  JobAttemptStatus,
  JobFailureClass,
  JobKind,
  JobStatus,
} from "@sylis/database";
import { DataExportCategory } from "@sylis/job-contracts";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { authenticatedMutationHeaders } from "../../fixtures/accounts";
import type { E2eNamespace } from "../../fixtures/namespace";
import { adminUrl } from "../../fixtures/operator";
import { test } from "../../fixtures/test";
import {
  E2eControllableService,
  E2eServiceControlAction,
  E2eStackStage,
  TestTag,
  e2eTags,
  e2ePorts,
  serviceControlUrl,
} from "../../runtime";

test(
  "RESILIENCE-001-E2E jobs fall back to polling during Redis loss and continue after recovery",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, request, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    await controlService(
      request,
      E2eControllableService.REDIS,
      E2eServiceControlAction.STOP,
    );
    try {
      await expectDataExportSucceeded(page, headers, namespace, "redis-down");
    } finally {
      await controlService(
        request,
        E2eControllableService.REDIS,
        E2eServiceControlAction.START,
      );
    }

    await expectDataExportSucceeded(
      page,
      headers,
      namespace,
      "redis-recovered",
    );
  },
);

test(
  "RESILIENCE-002-E2E an interrupted MinIO upload can be retried after recovery without a partial asset",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, request }) => {
    const headers = await authenticatedMutationHeaders(page);
    const body = Buffer.from(
      "MinIO recovery fixture for a quarantined asset.\n",
    );
    const contentHash = createHash("sha256").update(body).digest("hex");
    const intentResponse = await page.request.post(
      "/api/agent/v1/assets/upload-intents",
      {
        headers,
        data: {
          filename: "minio-recovery.txt",
          byteSize: body.byteLength,
          contentHash,
          mimeType: AssetMimeType.TEXT_PLAIN,
          purpose: ContentAssetPurpose.AGENT_CONTEXT,
        },
      },
    );
    expect(intentResponse.ok()).toBeTruthy();
    const intent = (await intentResponse.json()) as {
      assetId: string;
      intentId: string;
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
    };

    await controlService(
      request,
      E2eControllableService.MINIO,
      E2eServiceControlAction.STOP,
    );
    try {
      await expect(
        page.request.put(intent.uploadUrl, {
          headers: intent.requiredHeaders,
          data: body,
          timeout: 5_000,
        }),
      ).rejects.toThrow();
      const pending = await page.request.get(
        `/api/agent/v1/assets/${intent.assetId}`,
      );
      expect(pending.ok()).toBeTruthy();
      expect(
        ((await pending.json()) as { status: ContentAssetStatus }).status,
      ).toBe(ContentAssetStatus.QUARANTINED);
    } finally {
      await controlService(
        request,
        E2eControllableService.MINIO,
        E2eServiceControlAction.START,
      );
    }

    const uploadResponse = await page.request.put(intent.uploadUrl, {
      headers: intent.requiredHeaders,
      data: body,
    });
    expect(uploadResponse.ok()).toBeTruthy();
    const finalizeResponse = await page.request.post(
      `/api/agent/v1/assets/${intent.assetId}/finalize`,
      { headers, data: { intentId: intent.intentId } },
    );
    expect(finalizeResponse.ok()).toBeTruthy();
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/agent/v1/assets/${intent.assetId}`,
          );
          if (!response.ok()) return response.status();
          return ((await response.json()) as { status: ContentAssetStatus })
            .status;
        },
        { timeout: 90_000 },
      )
      .toBe(ContentAssetStatus.READY);
  },
);

test(
  "RESILIENCE-003-E2E readiness fails closed during PostgreSQL loss and recovers after restart",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ request }) => {
    const readinessUrl = `http://127.0.0.1:${e2ePorts().agentApi}/health/ready`;
    await controlService(
      request,
      E2eControllableService.POSTGRES,
      E2eServiceControlAction.STOP,
    );
    try {
      await expect
        .poll(() => reportsReady(request, readinessUrl), { timeout: 20_000 })
        .toBe(false);
    } finally {
      await controlService(
        request,
        E2eControllableService.POSTGRES,
        E2eServiceControlAction.START,
      );
    }

    await expect
      .poll(() => reportsReady(request, readinessUrl), { timeout: 45_000 })
      .toBe(true);
  },
);

test(
  "RESILIENCE-004-E2E a ClamAV outage keeps an asset quarantined and the transient scan retry completes after recovery",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY, TestTag.SECURITY),
  },
  async ({ learnerPage: page, operatorPage, request }) => {
    test.setTimeout(120_000);
    const headers = await authenticatedMutationHeaders(page);
    const body = Buffer.from("ClamAV transient recovery fixture.\n");
    const contentHash = createHash("sha256").update(body).digest("hex");
    const intentResponse = await page.request.post(
      "/api/agent/v1/assets/upload-intents",
      {
        headers,
        data: {
          filename: "clamav-recovery.txt",
          byteSize: body.byteLength,
          contentHash,
          mimeType: AssetMimeType.TEXT_PLAIN,
          purpose: ContentAssetPurpose.AGENT_CONTEXT,
        },
      },
    );
    expect(intentResponse.ok()).toBeTruthy();
    const intent = (await intentResponse.json()) as {
      assetId: string;
      intentId: string;
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
    };
    expect(
      (
        await page.request.put(intent.uploadUrl, {
          headers: intent.requiredHeaders,
          data: body,
        })
      ).ok(),
    ).toBeTruthy();

    await controlService(
      request,
      E2eControllableService.CLAMAV,
      E2eServiceControlAction.STOP,
    );
    let revisionId = "";
    let scanJobId = "";
    try {
      const finalizeResponse = await page.request.post(
        `/api/agent/v1/assets/${intent.assetId}/finalize`,
        { headers, data: { intentId: intent.intentId } },
      );
      expect(finalizeResponse.ok()).toBeTruthy();
      revisionId = ((await finalizeResponse.json()) as { revisionId: string })
        .revisionId;
      expect(revisionId).toBeTruthy();

      scanJobId = await findAssetScanJob(operatorPage, revisionId);
      await expect
        .poll(
          async () => {
            const job = await adminJob(operatorPage, scanJobId);
            return job.attempts.some(
              (attempt) =>
                attempt.status === JobAttemptStatus.FAILED &&
                attempt.failureClass === JobFailureClass.TRANSIENT,
            );
          },
          { timeout: 20_000 },
        )
        .toBe(true);

      const assetResponse = await page.request.get(
        `/api/agent/v1/assets/${intent.assetId}`,
      );
      expect(assetResponse.ok()).toBeTruthy();
      const asset = (await assetResponse.json()) as {
        status: ContentAssetStatus;
        revisions: Array<{
          id: string;
          status: ContentAssetRevisionStatus;
        }>;
      };
      expect(asset.status).toBe(ContentAssetStatus.PROCESSING);
      expect(asset.revisions).toContainEqual(
        expect.objectContaining({
          id: revisionId,
          status: ContentAssetRevisionStatus.QUARANTINED,
        }),
      );
    } finally {
      await controlService(
        request,
        E2eControllableService.CLAMAV,
        E2eServiceControlAction.START,
      );
    }

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/agent/v1/assets/${intent.assetId}`,
          );
          if (!response.ok()) return response.status();
          return ((await response.json()) as { status: ContentAssetStatus })
            .status;
        },
        { timeout: 90_000 },
      )
      .toBe(ContentAssetStatus.READY);
    await expect
      .poll(async () => (await adminJob(operatorPage, scanJobId)).status, {
        timeout: 30_000,
      })
      .toBe(JobStatus.SUCCEEDED);
    const recoveredJob = await adminJob(operatorPage, scanJobId);
    expect(recoveredJob.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: JobAttemptStatus.FAILED,
          failureClass: JobFailureClass.TRANSIENT,
        }),
        expect.objectContaining({ status: JobAttemptStatus.SUCCEEDED }),
      ]),
    );
  },
);

async function expectDataExportSucceeded(
  page: Page,
  headers: Record<string, string>,
  namespace: E2eNamespace,
  suffix: string,
): Promise<void> {
  const response = await page.request.post("/api/v1/users/me/data-exports", {
    headers: {
      ...headers,
      "Idempotency-Key": namespace.idempotencyKey(`resilience-${suffix}`),
    },
    data: { scope: [DataExportCategory.PROFILE] },
  });
  expect(response.ok()).toBeTruthy();
  const created = (await response.json()) as { requestId: string };
  await expect
    .poll(
      async () => {
        const statusResponse = await page.request.get(
          `/api/v1/users/me/data-exports/${created.requestId}`,
        );
        if (!statusResponse.ok()) return statusResponse.status();
        return ((await statusResponse.json()) as { status: JobStatus }).status;
      },
      { timeout: 45_000 },
    )
    .toBe(JobStatus.SUCCEEDED);
}

interface AdminJobView {
  id: string;
  kind: JobKind;
  ownerId: string;
  status: JobStatus;
  attempts: Array<{
    status: JobAttemptStatus;
    failureClass: JobFailureClass | null;
  }>;
}

async function findAssetScanJob(
  page: Page,
  revisionId: string,
): Promise<string> {
  let jobId = "";
  await expect
    .poll(
      async () => {
        const response = await page.request.get(adminUrl("/api/admin/v1/jobs"));
        if (!response.ok()) return null;
        const jobs = (await response.json()) as AdminJobView[];
        jobId =
          jobs.find(
            (job) =>
              job.kind === JobKind.ASSET_SCAN && job.ownerId === revisionId,
          )?.id ?? "";
        return jobId || null;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return jobId;
}

async function adminJob(page: Page, jobId: string): Promise<AdminJobView> {
  const response = await page.request.get(
    adminUrl(`/api/admin/v1/jobs/${jobId}`),
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AdminJobView;
}

async function reportsReady(
  request: APIRequestContext,
  readinessUrl: string,
): Promise<boolean> {
  try {
    return (
      await request.get(readinessUrl, {
        failOnStatusCode: false,
        timeout: 5_000,
      })
    ).ok();
  } catch {
    return false;
  }
}

async function controlService(
  request: APIRequestContext,
  service: E2eControllableService,
  action: E2eServiceControlAction,
): Promise<void> {
  const response = await request.post(serviceControlUrl(service, action));
  expect(response.ok()).toBeTruthy();
  expect((await response.json()) as { stage: E2eStackStage }).toMatchObject({
    stage: E2eStackStage.READY,
  });
}
