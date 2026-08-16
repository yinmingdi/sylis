import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  JobKind,
  JobOwnerType,
  JobStatus,
  SourceDatasetVersionStatus,
  SourceSynchronizationKind,
} from "@sylis/database";
import {
  SourceSyncProgressStage,
  SourceSyncResultType,
  SourceSyncSummarySchemaVersion,
  JobTerminalProgressStage,
} from "@sylis/job-contracts";
import { JobWorkerProgressStage } from "@sylis/job-runtime";
import { adminUrl, operatorMutationHeaders } from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

test(
  "SOURCE-001-E2E a registered HTTPS source is streamed, checksum verified, and recorded through the job boundary",
  {
    tag: e2eTags(TestTag.SYSTEM),
  },
  async ({ operatorPage: page, namespace }) => {
    const headers = await operatorMutationHeaders(page);
    const source = await readFile(
      resolve(
        import.meta.dirname,
        "../../fixtures/source/registered-source.csv",
      ),
    );
    const checksum = `sha256:${createHash("sha256").update(source).digest("hex")}`;
    const identity = namespace.value.slice(0, 12);

    const registrationResponse = await page.request.post(
      adminUrl("/api/admin/v1/source-datasets/versions"),
      {
        headers,
        data: {
          datasetKey: `e2e-source-${identity}`,
          datasetName: "E2E registered source",
          homepageUri: "https://source-fixture/",
          version: "2026-08-07",
          sourceUri: "https://source-fixture/registered-source.csv",
          checksum,
          retrievedAt: new Date().toISOString(),
          adapter: "ecdict-csv",
          parserVersion: "e2e/1",
          schemaVersion: "ecdict-csv/1",
          validationSummary: { fixture: true, records: 3 },
          status: SourceDatasetVersionStatus.VALIDATED,
          rights: {
            mayBuild: true,
            mayServe: true,
            mayExport: true,
            requiresAttribution: true,
            attribution: "Sylis E2E fixture",
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            effectiveTo: null,
          },
        },
      },
    );
    expect(registrationResponse.ok()).toBeTruthy();
    const registered = (await registrationResponse.json()) as { id: string };

    const createResponse = await page.request.post(
      adminUrl(
        `/api/admin/v1/source-datasets/versions/${registered.id}/synchronizations`,
      ),
      {
        headers: {
          ...headers,
          "Idempotency-Key": `e2e-source-sync-${identity}`,
        },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const created = (await createResponse.json()) as {
      synchronizationId: string;
      jobId: string;
    };

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            adminUrl(`/api/admin/v1/jobs/${created.jobId}`),
          );
          if (!response.ok()) return null;
          return ((await response.json()) as { status: JobStatus }).status;
        },
        { timeout: 30_000 },
      )
      .toBe(JobStatus.SUCCEEDED);

    const jobResponse = await page.request.get(
      adminUrl(`/api/admin/v1/jobs/${created.jobId}`),
    );
    expect(jobResponse.ok()).toBeTruthy();
    const job = (await jobResponse.json()) as {
      kind: JobKind;
      ownerType: JobOwnerType;
      ownerId: string;
      resultRef: {
        resultType: string;
        resultId: string;
        contentHash: string;
        summary: { byteSize: number };
      };
      progress: Array<{
        stage: string;
        processed: string;
        total: string | null;
      }>;
    };
    expect(job).toMatchObject({
      kind: JobKind.SOURCE_SYNC,
      ownerType: JobOwnerType.SOURCE_SYNCHRONIZATION,
      ownerId: created.synchronizationId,
      resultRef: {
        resultType: SourceSyncResultType.SOURCE_SYNCHRONIZATION,
        resultId: created.synchronizationId,
        contentHash: checksum,
        summary: { byteSize: source.byteLength },
      },
    });
    expect(job.progress.map(({ stage }) => stage)).toEqual([
      JobWorkerProgressStage.STARTING,
      SourceSyncProgressStage.FETCHING,
      SourceSyncProgressStage.VERIFYING,
      SourceSyncProgressStage.VERIFIED,
      JobTerminalProgressStage.COMPLETED,
    ]);
    expect(
      job.progress.find(
        ({ stage }) => stage === SourceSyncProgressStage.VERIFIED,
      ),
    ).toMatchObject({
      processed: String(source.byteLength),
      total: String(source.byteLength),
    });

    const synchronizationResponse = await page.request.get(
      adminUrl(
        `/api/admin/v1/source-datasets/versions/${registered.id}/synchronizations`,
      ),
    );
    expect(synchronizationResponse.ok()).toBeTruthy();
    const synchronizations = (await synchronizationResponse.json()) as Array<{
      id: string;
      sourceKind: SourceSynchronizationKind;
      summary: {
        schemaVersion: SourceSyncSummarySchemaVersion;
        sourceDatasetVersionId: string;
        contentHash: string;
        byteSize: number;
        verifiedAt: string;
      };
      completedAt: string | null;
      job: { status: JobStatus; errorCode: string | null };
    }>;
    expect(synchronizations).toContainEqual(
      expect.objectContaining({
        id: created.synchronizationId,
        sourceKind: SourceSynchronizationKind.DATASET_VERSION,
        summary: expect.objectContaining({
          schemaVersion: SourceSyncSummarySchemaVersion.V1,
          sourceDatasetVersionId: registered.id,
          contentHash: checksum,
          byteSize: source.byteLength,
          verifiedAt: expect.any(String),
        }),
        completedAt: expect.any(String),
        job: expect.objectContaining({
          status: JobStatus.SUCCEEDED,
          errorCode: null,
        }),
      }),
    );
  },
);
