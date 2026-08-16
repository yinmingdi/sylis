import { createHash } from "node:crypto";
import { zstdDecompressSync } from "node:zlib";

import {
  JobKind,
  JobOwnerType,
  JobStatus,
  SecurityAuditCategory,
} from "@sylis/database";
import {
  AuditArchiveProgressStage,
  AuditArchiveResultType,
  AuditEventStreamKind,
  AuditExportProgressStage,
  AuditExportRecordKind,
  AuditExportResultType,
  AuditExportSchemaVersion,
  JobTerminalProgressStage,
} from "@sylis/job-contracts";
import { JobWorkerProgressStage } from "@sylis/job-runtime";
import { adminUrl, operatorMutationHeaders } from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

interface AuditExportRecord {
  recordKind: AuditExportRecordKind;
  schemaVersion?: AuditExportSchemaVersion;
  query?: Record<string, unknown>;
  event?: {
    action?: string;
    reason?: string;
  };
}

test(
  "AUDIT-001-E2E an audit export preserves its query snapshot, redacts content, and exposes a verified artifact",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ operatorPage: page, namespace }) => {
    const headers = await operatorMutationHeaders(page);
    const marker = ["Bearer", `e2e-sensitive-${namespace.value}`].join(" ");
    const from = new Date(Date.now() - 60_000).toISOString();

    const legalHoldResponse = await page.request.post(
      adminUrl("/api/admin/v1/audit/legal-holds"),
      {
        headers,
        data: {
          scopeKind: "GLOBAL",
          reason: marker,
          externalReference: `e2e-${namespace.value}`,
          reviewAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    );
    expect(legalHoldResponse.ok()).toBeTruthy();
    const legalHold = (await legalHoldResponse.json()) as { id: string };

    const decoyResponse = await page.request.post(
      adminUrl("/api/admin/v1/audit/legal-holds"),
      {
        headers,
        data: {
          scopeKind: "AUDIT_CATEGORY",
          scopeRef: SecurityAuditCategory.SECURITY,
          reason: "E2E audit filter decoy",
          externalReference: `e2e-decoy-${namespace.value}`,
          reviewAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    );
    expect(decoyResponse.ok()).toBeTruthy();
    const decoyHold = (await decoyResponse.json()) as { id: string };

    const to = new Date(Date.now() + 60_000).toISOString();
    const createResponse = await page.request.post(
      adminUrl("/api/admin/v1/audit/exports"),
      {
        headers: {
          ...headers,
          "Idempotency-Key": namespace.idempotencyKey("audit-export"),
        },
        data: {
          streams: [AuditEventStreamKind.SECURITY],
          from,
          to,
          category: SecurityAuditCategory.RETENTION,
          action: "legal-hold.created",
          targetType: "LegalHold",
          targetId: legalHold.id,
          reason: "E2E audit artifact verification",
        },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const created = (await createResponse.json()) as {
      exportId: string;
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
      status: JobStatus;
      resultRef: { resultType: string; contentHash: string };
      progress: Array<{
        stage: string;
        processed: string;
        total: string | null;
      }>;
    };
    expect(job).toMatchObject({
      kind: JobKind.AUDIT_EXPORT,
      ownerType: JobOwnerType.AUDIT_EXPORT,
      ownerId: created.exportId,
      status: JobStatus.SUCCEEDED,
      resultRef: {
        resultType: AuditExportResultType.AUDIT_EXPORT,
        contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    });
    const progressStages = job.progress.map(({ stage }) => stage);
    expect(progressStages.slice(0, 2)).toEqual([
      JobWorkerProgressStage.STARTING,
      AuditExportProgressStage.QUERYING,
    ]);
    expect(progressStages.slice(2, -2)).not.toHaveLength(0);
    expect(
      progressStages
        .slice(2, -2)
        .every(
          (stage) => stage === AuditExportProgressStage.STREAMING_ARTIFACT,
        ),
    ).toBe(true);
    expect(progressStages.slice(-2)).toEqual([
      AuditExportProgressStage.UPLOADED,
      JobTerminalProgressStage.COMPLETED,
    ]);

    const artifactResponse = await page.request.get(
      adminUrl(`/api/admin/v1/audit/exports/${created.exportId}`),
    );
    expect(artifactResponse.ok()).toBeTruthy();
    const artifact = (await artifactResponse.json()) as {
      downloadUrl: string;
      contentHash: string;
      eventCount: string;
      expiresAt: string;
    };
    expect(artifact.contentHash).toBe(job.resultRef.contentHash);
    expect(new Date(artifact.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const downloadResponse = await fetch(artifact.downloadUrl);
    expect(downloadResponse.ok).toBeTruthy();
    const compressed = Buffer.from(await downloadResponse.arrayBuffer());
    const downloadedHash = `sha256:${createHash("sha256")
      .update(compressed)
      .digest("hex")}`;
    expect(downloadedHash).toBe(artifact.contentHash);
    const records = zstdDecompressSync(compressed)
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as AuditExportRecord);
    expect(records[0]).toMatchObject({
      recordKind: AuditExportRecordKind.MANIFEST,
      schemaVersion: AuditExportSchemaVersion.V1,
      query: {
        schemaVersion: AuditExportSchemaVersion.V1,
        streams: [AuditEventStreamKind.SECURITY],
        from,
        to,
        category: SecurityAuditCategory.RETENTION,
        action: "legal-hold.created",
        targetType: "LegalHold",
        targetId: legalHold.id,
      },
    });
    expect(
      Date.parse(String(records[0]?.query?.snapshotAt)),
    ).toBeLessThanOrEqual(Date.now());
    const events = records.slice(1);
    expect(events).toHaveLength(Number(artifact.eventCount));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      recordKind: AuditExportRecordKind.SECURITY_EVENT,
      event: {
        action: "legal-hold.created",
        reason: "Bearer [REDACTED]",
      },
    });
    expect(zstdDecompressSync(compressed).toString("utf8")).not.toContain(
      marker,
    );
    for (const holdId of [legalHold.id, decoyHold.id]) {
      const release = await page.request.post(
        adminUrl(`/api/admin/v1/audit/legal-holds/${holdId}/releases`),
        {
          headers,
          data: { reason: "E2E audit export cleanup" },
        },
      );
      expect(release.ok()).toBeTruthy();
    }
  },
);

test(
  "AUDIT-002-E2E an audit archive freezes exact events and reaches ACTIVE through the automation executor",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ operatorPage: page, namespace }) => {
    const headers = await operatorMutationHeaders(page);
    const from = new Date(Date.now() - 60_000).toISOString();
    const holdResponse = await page.request.post(
      adminUrl("/api/admin/v1/audit/legal-holds"),
      {
        headers,
        data: {
          scopeKind: "AUDIT_CATEGORY",
          scopeRef: SecurityAuditCategory.RETENTION,
          reason: `E2E archive source ${namespace.value}`,
          reviewAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    );
    expect(holdResponse.ok()).toBeTruthy();
    const hold = (await holdResponse.json()) as { id: string };
    const release = await page.request.post(
      adminUrl(`/api/admin/v1/audit/legal-holds/${hold.id}/releases`),
      {
        headers,
        data: { reason: "Release before archive verification" },
      },
    );
    expect(release.ok()).toBeTruthy();
    const to = new Date().toISOString();

    const create = await page.request.post(
      adminUrl("/api/admin/v1/audit/archives"),
      {
        headers: {
          ...headers,
          "Idempotency-Key": namespace.idempotencyKey("audit-archive"),
        },
        data: {
          category: SecurityAuditCategory.RETENTION,
          from,
          to,
          reason: "E2E encrypted audit archive verification",
        },
      },
    );
    expect(create.ok()).toBeTruthy();
    const receipt = (await create.json()) as {
      archiveId: string;
      jobId: string;
    };
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            adminUrl(`/api/admin/v1/jobs/${receipt.jobId}`),
          );
          if (!response.ok()) return null;
          return ((await response.json()) as { status: JobStatus }).status;
        },
        { timeout: 30_000 },
      )
      .toBe(JobStatus.SUCCEEDED);

    const jobResponse = await page.request.get(
      adminUrl(`/api/admin/v1/jobs/${receipt.jobId}`),
    );
    const job = (await jobResponse.json()) as {
      kind: JobKind;
      resultRef: { resultType: string; contentHash: string };
      progress: Array<{ stage: string }>;
    };
    expect(job).toMatchObject({
      kind: JobKind.AUDIT_ARCHIVE,
      resultRef: {
        resultType: AuditArchiveResultType.ARCHIVE,
        contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    });
    expect(job.progress.map(({ stage }) => stage)).toEqual(
      expect.arrayContaining([
        AuditArchiveProgressStage.SNAPSHOTTING,
        AuditArchiveProgressStage.HASHING,
        AuditArchiveProgressStage.ENCRYPTING,
        AuditArchiveProgressStage.RECORDED,
      ]),
    );

    const retentionResponse = await page.request.get(
      adminUrl("/api/admin/v1/audit/retention"),
    );
    expect(retentionResponse.ok()).toBeTruthy();
    const retention = (await retentionResponse.json()) as {
      archives: Array<{
        id: string;
        status: string;
        eventCount: string;
        contentHash: string;
        encryptionVersion: string;
      }>;
    };
    expect(retention.archives).toContainEqual(
      expect.objectContaining({
        id: receipt.archiveId,
        status: "ACTIVE",
        contentHash: job.resultRef.contentHash,
        encryptionVersion: "e2e",
      }),
    );
  },
);
