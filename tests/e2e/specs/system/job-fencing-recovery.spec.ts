import { JobAttemptStatus, JobStatus } from "@sylis/database";
import {
  DataExportCategory,
  DataExportProgressStage,
  DataExportResultType,
} from "@sylis/job-contracts";
import { JobFailureClass } from "@sylis/job-runtime";

import { authenticatedMutationHeaders } from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import {
  E2eControllableService,
  E2eServiceControlAction,
  TestTag,
  e2eTags,
  serviceControlUrl,
} from "../../runtime";

test(
  "JOB-001-E2E an expired worker lease is recovered with a higher fencing token",
  {
    tag: e2eTags(TestTag.SYSTEM),
  },
  async ({ learnerPage: page, namespace, operatorPage: adminPage }) => {
    const headers = await authenticatedMutationHeaders(page);
    const createResponse = await page.request.post(
      "/api/v1/users/me/data-exports",
      {
        headers: {
          ...headers,
          "Idempotency-Key": namespace.idempotencyKey("fencing-recovery"),
        },
        data: { scope: [DataExportCategory.PROFILE] },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const created = (await createResponse.json()) as {
      requestId: string;
      jobId: string;
    };

    await expect
      .poll(
        async () => {
          const response = await adminPage.request.get(
            `/api/admin/v1/jobs/${created.jobId}`,
          );
          if (!response.ok()) return null;
          const job = (await response.json()) as {
            status: JobStatus;
            progress: Array<{ stage: string }>;
          };
          return {
            status: job.status,
            collecting: job.progress.some(
              ({ stage }) => stage === DataExportProgressStage.COLLECTING,
            ),
          };
        },
        { timeout: 15_000 },
      )
      .toEqual({ status: JobStatus.RUNNING, collecting: true });

    const restartResponse = await page.request.post(
      serviceControlUrl(
        E2eControllableService.AUTOMATION_EXECUTOR,
        E2eServiceControlAction.RESTART,
      ),
      { timeout: 60_000 },
    );
    expect(restartResponse.ok()).toBeTruthy();

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/v1/users/me/data-exports/${created.requestId}`,
          );
          if (!response.ok()) return null;
          return ((await response.json()) as { status: JobStatus }).status;
        },
        { timeout: 30_000 },
      )
      .toBe(JobStatus.SUCCEEDED);

    const exportResponse = await page.request.get(
      `/api/v1/users/me/data-exports/${created.requestId}`,
    );
    const exportStatus = (await exportResponse.json()) as {
      artifactUrl: string;
    };
    const artifactResponse = await fetch(exportStatus.artifactUrl);
    const artifact = (await artifactResponse.json()) as Record<string, unknown>;
    expect(artifact.categories).toEqual([DataExportCategory.PROFILE]);
    expect(artifact).toHaveProperty("profile");
    expect(artifact).not.toHaveProperty("notebooks");
    expect(artifact).not.toHaveProperty("exerciseAttempts");

    const detailResponse = await adminPage.request.get(
      `/api/admin/v1/jobs/${created.jobId}`,
    );
    expect(detailResponse.ok()).toBeTruthy();
    const job = (await detailResponse.json()) as {
      status: JobStatus;
      resultRef: { resultType: string; contentHash: string };
      attempts: Array<{
        attemptNumber: number;
        status: JobAttemptStatus;
        fencingToken: string;
        failureClass: string | null;
      }>;
    };
    expect(job.status).toBe(JobStatus.SUCCEEDED);
    expect(job.resultRef).toMatchObject({
      resultType: DataExportResultType.USER_DATA_EXPORT,
      contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(job.attempts).toHaveLength(2);
    const [recoveryAttempt, expiredAttempt] = job.attempts;
    expect(recoveryAttempt).toMatchObject({
      attemptNumber: 2,
      status: JobAttemptStatus.SUCCEEDED,
      failureClass: null,
    });
    expect(expiredAttempt).toMatchObject({
      attemptNumber: 1,
      status: JobAttemptStatus.UNKNOWN_OUTCOME,
      failureClass: JobFailureClass.UNKNOWN_OUTCOME,
    });
    expect(BigInt(recoveryAttempt!.fencingToken)).toBeGreaterThan(
      BigInt(expiredAttempt!.fencingToken),
    );
  },
);
