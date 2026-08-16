import {
  JobAttemptStatus,
  JobKind,
  JobOwnerType,
  JobStatus,
} from "@sylis/database";
import {
  DataExportCategory,
  DataExportProgressStage,
  DataExportResultType,
  DataExportSchemaVersion,
  JobTerminalProgressStage,
} from "@sylis/job-contracts";
import { JobWorkerProgressStage } from "@sylis/job-runtime";

import { authenticatedMutationHeaders } from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

interface DataExportStatus {
  id: string;
  jobId: string;
  status: JobStatus;
  failureCode: string | null;
  artifactUrl: string | null;
  expiresAt: string | null;
  expired: boolean;
}

test(
  "DATA_EXPORT-001-E2E a user export is executed and observable through the admin job API",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({
    learnerAccount: user,
    learnerPage: page,
    namespace,
    operatorPage: adminPage,
  }) => {
    const userHeaders = await authenticatedMutationHeaders(page);
    const invalidScopeResponse = await page.request.post(
      "/api/v1/users/me/data-exports",
      {
        headers: {
          ...userHeaders,
          "Idempotency-Key": namespace.idempotencyKey("data-export-invalid"),
        },
        data: { scope: ["UNKNOWN"] },
      },
    );
    expect(invalidScopeResponse.status()).toBe(400);

    const exportNotebookName = `Export notebook ${namespace.value}`;
    const notebookResponse = await page.request.post("/api/v1/notebooks", {
      headers: userHeaders,
      data: { name: exportNotebookName },
    });
    expect(notebookResponse.ok()).toBeTruthy();

    const requestResponse = await page.request.post(
      "/api/v1/users/me/data-exports",
      {
        headers: {
          ...userHeaders,
          "Idempotency-Key": namespace.idempotencyKey("data-export"),
        },
        data: { scope: Object.values(DataExportCategory) },
      },
    );
    expect(requestResponse.ok()).toBeTruthy();
    const request = (await requestResponse.json()) as {
      requestId: string;
      jobId: string;
    };

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/v1/users/me/data-exports/${request.requestId}`,
          );
          if (!response.ok()) return null;
          return ((await response.json()) as DataExportStatus).status;
        },
        { timeout: 30_000 },
      )
      .toBe(JobStatus.SUCCEEDED);

    const exportStatusResponse = await page.request.get(
      `/api/v1/users/me/data-exports/${request.requestId}`,
    );
    expect(exportStatusResponse.ok()).toBeTruthy();
    const exportStatus =
      (await exportStatusResponse.json()) as DataExportStatus;

    expect(exportStatus).toMatchObject({
      id: request.requestId,
      jobId: request.jobId,
      status: JobStatus.SUCCEEDED,
      failureCode: null,
      expired: false,
    });
    expect(exportStatus.artifactUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(new Date(exportStatus.expiresAt ?? 0).getTime()).toBeGreaterThan(
      Date.now(),
    );

    const artifactResponse = await fetch(exportStatus.artifactUrl!);
    expect(artifactResponse.ok).toBeTruthy();
    const artifact = (await artifactResponse.json()) as {
      schemaVersion: DataExportSchemaVersion;
      categories: DataExportCategory[];
      profile: { emails: Array<{ displayEmail: string }> };
      notebooks: Array<{
        name: string;
        isDefault: boolean;
        items: unknown[];
      }>;
      exerciseAttempts: unknown[];
    };
    expect(artifact.schemaVersion).toBe(DataExportSchemaVersion.V1);
    expect(artifact.categories).toEqual(
      [...Object.values(DataExportCategory)].sort(),
    );
    expect(artifact.profile.emails).toContainEqual(
      expect.objectContaining({ displayEmail: user.email }),
    );
    expect(artifact.notebooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Vocabulary",
          isDefault: true,
          items: [],
        }),
        expect.objectContaining({
          name: exportNotebookName,
          isDefault: false,
          items: [],
        }),
      ]),
    );
    expect(
      artifact.notebooks.filter(({ isDefault }) => isDefault),
    ).toHaveLength(1);
    expect(artifact.exerciseAttempts).toEqual([]);

    const detailResponse = await adminPage.request.get(
      `/api/admin/v1/jobs/${request.jobId}`,
    );
    expect(detailResponse.ok()).toBeTruthy();
    const job = (await detailResponse.json()) as {
      id: string;
      kind: JobKind;
      ownerType: JobOwnerType;
      ownerId: string;
      status: JobStatus;
      resultRef: {
        resultType: string;
        contentHash: string;
        uri?: never;
      };
      attempts: Array<{
        status: JobAttemptStatus;
        fencingToken: string;
        leaseOwner: string;
      }>;
      progress: Array<{
        sequence: number;
        stage: string;
        processed: string;
        total: string;
      }>;
    };
    expect(job).toMatchObject({
      id: request.jobId,
      kind: JobKind.DATA_EXPORT,
      ownerType: JobOwnerType.USER_EXPORT,
      ownerId: request.requestId,
      status: JobStatus.SUCCEEDED,
      resultRef: {
        resultType: DataExportResultType.USER_DATA_EXPORT,
        contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    });
    expect(job.resultRef).not.toHaveProperty("uri");
    expect(job.attempts).toHaveLength(1);
    expect(job.attempts[0]).toMatchObject({
      status: JobAttemptStatus.SUCCEEDED,
      fencingToken: expect.stringMatching(/^\d+$/),
    });
    expect(job.progress.map(({ stage }) => stage)).toEqual([
      JobWorkerProgressStage.STARTING,
      DataExportProgressStage.COLLECTING,
      DataExportProgressStage.SERIALIZING,
      DataExportProgressStage.UPLOADED,
      JobTerminalProgressStage.COMPLETED,
    ]);
    expect(
      job.progress.find(
        ({ stage }) => stage === DataExportProgressStage.UPLOADED,
      ),
    ).toMatchObject({
      processed: "3",
      total: "3",
    });
  },
);
