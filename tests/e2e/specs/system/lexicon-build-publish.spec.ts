import {
  BuildRunMode,
  BuildRunStatus,
  JobStatus,
  LexiconCompileProfile,
  LexiconReleaseStatus,
  PublishRunStatus,
} from "@sylis/database";
import {
  JobTerminalProgressStage,
  LexiconPublishProgressStage,
  LexiconPublishResultType,
} from "@sylis/job-contracts";
import { JobWorkerProgressStage } from "@sylis/job-runtime";
import type { APIResponse, Page } from "@playwright/test";

import {
  adminUrl,
  operatorMutationHeaders,
  reauthenticateOperator,
} from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import {
  E2eLexiconSourceAdapter,
  E2eLexiconSourceKey,
  TestTag,
  e2eLexiconFixture,
  e2eTags,
} from "../../runtime";

interface BuildRunView {
  id: string;
  status: BuildRunStatus;
  artifactUri: string | null;
  artifactHash: string | null;
  activations: Array<{
    job: { status: JobStatus; errorCode: string | null };
  }>;
}

interface PublishRunView {
  id: string;
  status: PublishRunStatus;
  releaseId: string | null;
  importedCounts: Record<string, number> | null;
  job: { id: string; status: JobStatus; errorCode: string | null };
}

interface PublishJobView {
  resultRef: {
    resultType: LexiconPublishResultType;
    resultId: string;
    contentHash: string;
    summary: {
      entityCount: number;
      reused: boolean;
      valid: boolean;
    };
  };
  progress: Array<{
    processed: string;
    stage: string;
    total: string | null;
  }>;
}

interface ReleaseView {
  id: string;
  contentHash: string;
  status: LexiconReleaseStatus;
  validationSummary: {
    valid?: boolean;
    counts?: { headwords?: number };
  };
  sourceInputs: Array<{
    sourceKey: string;
    adapter: string;
    checksum: string;
  }>;
}

test(
  "LEXICON-003-E2E a checksum-pinned four-source pilot builds and publishes a validated release",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ operatorPage: page, namespace }) => {
    test.setTimeout(6 * 60_000);
    await reauthenticateOperator(page);
    const headers = await operatorMutationHeaders(page);
    const fixture = e2eLexiconFixture();

    const buildResponse = await page.request.post(
      adminUrl("/api/admin/v1/lexicon/build-runs"),
      {
        headers: {
          ...headers,
          "Idempotency-Key": namespace.idempotencyKey("lexicon-pilot-build"),
        },
        data: {
          mode: BuildRunMode.PILOT,
          manifestUri: fixture.manifestUri,
          manifestHash: fixture.manifestHash,
          compileProfile: LexiconCompileProfile.PILOT_200,
          modelPolicy: { enabled: false },
          budgetMicros: "0",
          codeVersion: `e2e-pilot-200-v1-${namespace.value}`,
          schemaVersion: "sylis.lexicon-artifact/1",
        },
      },
    );
    await expectOk(buildResponse, "create four-source Lexicon build");
    const buildId = ((await buildResponse.json()) as { runId: string }).runId;

    await expect
      .poll(() => terminalBuildStatus(page, buildId), {
        timeout: 3 * 60_000,
        intervals: [250, 500, 1_000, 2_000],
      })
      .toBe(BuildRunStatus.ARTIFACT_PUBLISHED);
    const build = await readBuild(page, buildId);
    expect(build.artifactUri).toMatch(/^s3:\/\/sylis-lexicon\//);
    expect(build.artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const publishResponse = await page.request.post(
      adminUrl("/api/admin/v1/lexicon/publish-runs"),
      {
        headers: {
          ...headers,
          "Idempotency-Key": namespace.idempotencyKey("lexicon-pilot-publish"),
        },
        data: {
          artifactUri: build.artifactUri,
          artifactHash: build.artifactHash,
          expectedSchema: "sylis.lexicon-artifact/1",
        },
      },
    );
    await expectOk(publishResponse, "create Lexicon publish");
    const publishId = ((await publishResponse.json()) as { runId: string })
      .runId;

    await expect
      .poll(() => terminalPublishStatus(page, publishId), {
        timeout: 3 * 60_000,
        intervals: [250, 500, 1_000, 2_000],
      })
      .toBe(PublishRunStatus.SUCCEEDED);
    const publish = await readPublish(page, publishId);
    expect(publish.releaseId).toBeTruthy();
    expect(publish.importedCounts?.["/lexicon/headwords"]).toBe(200);
    const importedEntityCount = Object.values(
      publish.importedCounts ?? {},
    ).reduce((sum, count) => sum + count, 0);

    const jobResponse = await page.request.get(
      adminUrl(`/api/admin/v1/jobs/${publish.job.id}`),
    );
    await expectOk(jobResponse, "read Lexicon publish progress");
    const publishJob = (await jobResponse.json()) as PublishJobView;
    expect(publishJob.resultRef).toMatchObject({
      resultType: LexiconPublishResultType.RELEASE,
      resultId: publish.releaseId,
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      summary: {
        entityCount: importedEntityCount,
        reused: false,
        valid: true,
      },
    });
    expect([...new Set(publishJob.progress.map(({ stage }) => stage))]).toEqual(
      [
        JobWorkerProgressStage.STARTING,
        LexiconPublishProgressStage.MATERIALIZING,
        LexiconPublishProgressStage.STAGING,
        LexiconPublishProgressStage.BUILDING_RELEASE,
        LexiconPublishProgressStage.VALIDATING_RELEASE,
        LexiconPublishProgressStage.VALIDATED,
        JobTerminalProgressStage.COMPLETED,
      ],
    );
    expect(
      publishJob.progress.findLast(
        ({ stage }) => stage === LexiconPublishProgressStage.STAGING,
      ),
    ).toMatchObject({
      processed: String(importedEntityCount),
      total: String(importedEntityCount),
    });

    const releasesResponse = await page.request.get(
      adminUrl("/api/admin/v1/lexicon/releases"),
    );
    await expectOk(releasesResponse, "read published Lexicon release");
    const release = ((await releasesResponse.json()) as ReleaseView[]).find(
      ({ id }) => id === publish.releaseId,
    );
    expect(release).toBeDefined();
    expect(release).toMatchObject({
      status: LexiconReleaseStatus.VALIDATED,
      validationSummary: { valid: true, counts: { headwords: 200 } },
    });
    expect(publishJob.resultRef.contentHash).toBe(release!.contentHash);
    expect(
      release!.sourceInputs.map(({ sourceKey, adapter }) => ({
        sourceKey,
        adapter,
      })),
    ).toEqual([
      {
        sourceKey: E2eLexiconSourceKey.ECDICT,
        adapter: E2eLexiconSourceAdapter.ECDICT,
      },
      {
        sourceKey: E2eLexiconSourceKey.KAIKKI,
        adapter: E2eLexiconSourceAdapter.WIKTEXTRACT_EN,
      },
      {
        sourceKey: E2eLexiconSourceKey.OEWN,
        adapter: E2eLexiconSourceAdapter.WN_LMF,
      },
      {
        sourceKey: E2eLexiconSourceKey.YOUDAO,
        adapter: E2eLexiconSourceAdapter.YOUDAO_NDJSON,
      },
    ]);
    expect(
      release!.sourceInputs.every(({ checksum }) =>
        /^sha256:[a-f0-9]{64}$/.test(checksum),
      ),
    ).toBeTruthy();
  },
);

async function terminalBuildStatus(
  page: Page,
  buildId: string,
): Promise<BuildRunStatus> {
  const run = await readBuild(page, buildId);
  const job = run.activations[0]?.job;
  if (job?.status === JobStatus.FAILED) {
    throw new Error(`LEXICON_BUILD_JOB_FAILED:${job.errorCode ?? "UNKNOWN"}`);
  }
  return run.status;
}

async function readBuild(page: Page, buildId: string): Promise<BuildRunView> {
  const response = await page.request.get(
    adminUrl("/api/admin/v1/lexicon/build-runs"),
  );
  await expectOk(response, "read Lexicon builds");
  const run = ((await response.json()) as BuildRunView[]).find(
    ({ id }) => id === buildId,
  );
  if (!run) throw new Error("E2E_LEXICON_BUILD_NOT_FOUND");
  return run;
}

async function terminalPublishStatus(
  page: Page,
  publishId: string,
): Promise<PublishRunStatus> {
  const run = await readPublish(page, publishId);
  if (run.job.status === JobStatus.FAILED) {
    throw new Error(
      `LEXICON_PUBLISH_JOB_FAILED:${run.job.errorCode ?? "UNKNOWN"}`,
    );
  }
  return run.status;
}

async function readPublish(
  page: Page,
  publishId: string,
): Promise<PublishRunView> {
  const response = await page.request.get(
    adminUrl("/api/admin/v1/lexicon/publish-runs"),
  );
  await expectOk(response, "read Lexicon publishes");
  const run = ((await response.json()) as PublishRunView[]).find(
    ({ id }) => id === publishId,
  );
  if (!run) throw new Error("E2E_LEXICON_PUBLISH_NOT_FOUND");
  return run;
}

async function expectOk(
  response: APIResponse,
  operation: string,
): Promise<void> {
  if (response.ok()) return;
  throw new Error(
    `${operation} failed: status=${response.status()} body=${await response.text()}`,
  );
}
