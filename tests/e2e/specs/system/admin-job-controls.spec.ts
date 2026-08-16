import {
  JobAttemptStatus,
  JobStatus,
  SourceDatasetVersionStatus,
} from "@sylis/database";
import { DataExportCategory } from "@sylis/job-contracts";
import type { Page } from "@playwright/test";

import { authenticatedMutationHeaders } from "../../fixtures/accounts";
import {
  adminUrl,
  operatorMutationHeaders,
  reauthenticateOperator,
} from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

test(
  "ADMIN-JOB-001-E2E an operator cancels active work and retries a permanently failed job",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ learnerPage: page, namespace, operatorPage: adminPage }) => {
    const userHeaders = await authenticatedMutationHeaders(page);
    await reauthenticateOperator(adminPage);
    const adminHeaders = await operatorMutationHeaders(adminPage);

    const exportResponse = await page.request.post(
      "/api/v1/users/me/data-exports",
      {
        headers: {
          ...userHeaders,
          "Idempotency-Key": namespace.idempotencyKey("admin-cancel"),
        },
        data: { scope: [DataExportCategory.PROFILE] },
      },
    );
    expect(exportResponse.ok()).toBeTruthy();
    const dataExport = (await exportResponse.json()) as {
      requestId: string;
      jobId: string;
    };
    await expectJobStatus(adminPage, dataExport.jobId, JobStatus.RUNNING);

    const cancelResponse = await adminPage.request.post(
      adminUrl(`/api/admin/v1/jobs/${dataExport.jobId}/cancel`),
      {
        headers: adminHeaders,
        data: { reason: "E2E verifies operator cancellation" },
      },
    );
    expect(cancelResponse.ok()).toBeTruthy();
    await expectJobStatus(
      adminPage,
      dataExport.jobId,
      JobStatus.CANCELLED,
      30_000,
    );

    const identity = namespace.value.slice(0, 12);
    const registrationResponse = await adminPage.request.post(
      adminUrl("/api/admin/v1/source-datasets/versions"),
      {
        headers: adminHeaders,
        data: {
          datasetKey: `e2e-retry-source-${identity}`,
          datasetName: "E2E retry source",
          homepageUri: "https://source-fixture/",
          version: "2026-08-08",
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
    expect(registrationResponse.ok()).toBeTruthy();
    const source = (await registrationResponse.json()) as { id: string };

    const synchronizationResponse = await adminPage.request.post(
      adminUrl(
        `/api/admin/v1/source-datasets/versions/${source.id}/synchronizations`,
      ),
      {
        headers: {
          ...adminHeaders,
          "Idempotency-Key": namespace.idempotencyKey("admin-retry"),
        },
      },
    );
    expect(synchronizationResponse.ok()).toBeTruthy();
    const synchronization = (await synchronizationResponse.json()) as {
      jobId: string;
    };
    await expectJobStatus(adminPage, synchronization.jobId, JobStatus.FAILED);

    const retryResponse = await adminPage.request.post(
      adminUrl(`/api/admin/v1/jobs/${synchronization.jobId}/retry`),
      {
        headers: adminHeaders,
        data: { reason: "E2E verifies operator retry scheduling" },
      },
    );
    expect(retryResponse.ok()).toBeTruthy();
    const retryJob = (await retryResponse.json()) as {
      id: string;
      status: JobStatus;
      supersedesJobId: string | null;
    };
    expect(retryJob).toMatchObject({
      status: JobStatus.QUEUED,
      supersedesJobId: synchronization.jobId,
    });
    expect(retryJob.id).not.toBe(synchronization.jobId);
    await expectJobStatus(adminPage, synchronization.jobId, JobStatus.FAILED);
    await expectJobStatus(adminPage, retryJob.id, JobStatus.FAILED);

    const jobResponse = await adminPage.request.get(
      adminUrl(`/api/admin/v1/jobs/${synchronization.jobId}`),
    );
    expect(jobResponse.ok()).toBeTruthy();
    const job = (await jobResponse.json()) as {
      attempts: Array<{ status: JobAttemptStatus }>;
    };
    expect(job.attempts).toEqual([
      expect.objectContaining({ status: JobAttemptStatus.FAILED }),
    ]);
  },
);

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
