import { createHash } from "node:crypto";

import { DeploymentEnvironment } from "@sylis/database";
import {
  DeploymentEvidenceResult,
  DeploymentEvidenceSchemaVersion,
  DeploymentManifestSchemaVersion,
  DeploymentService,
} from "@sylis/utils";

import { adminUrl, operatorMutationHeaders } from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eDeploymentIngestToken, e2eTags } from "../../runtime";

test(
  "DEPLOYMENT-001-E2E only the CI identity ingests an immutable release",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY, TestTag.DEPLOYMENT),
  },
  async ({ namespace, operatorPage: page }) => {
    const input = releaseInput(namespace.value);
    const internalUrl = adminUrl("/internal/v1/deployment-releases");

    const unauthorized = await page.request.post(internalUrl, {
      headers: { Authorization: `Bearer ${"x".repeat(64)}` },
      data: input,
    });
    expect(unauthorized.status()).toBe(401);

    const authorization = {
      Authorization: `Bearer ${e2eDeploymentIngestToken()}`,
    };
    const createdResponse = await page.request.post(internalUrl, {
      headers: authorization,
      data: input,
    });
    expect(createdResponse.ok()).toBeTruthy();
    const created = (await createdResponse.json()) as {
      id: string;
      releaseDigest: string;
    };
    expect(created).toMatchObject({
      id: expect.any(String),
      releaseDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });

    const replayResponse = await page.request.post(internalUrl, {
      headers: authorization,
      data: input,
    });
    expect(replayResponse.ok()).toBeTruthy();
    await expect(replayResponse.json()).resolves.toMatchObject({
      id: created.id,
      releaseDigest: created.releaseDigest,
    });

    const conflictResponse = await page.request.post(internalUrl, {
      headers: authorization,
      data: { ...input, deploymentUrl: "https://other.sylis.test" },
    });
    expect(conflictResponse.status()).toBe(409);

    const browserWrite = await page.request.post(
      adminUrl("/api/admin/v1/deployment-releases"),
      {
        headers: await operatorMutationHeaders(page),
        data: input,
      },
    );
    expect(browserWrite.status()).toBe(404);

    const projection = await page.request.get(
      adminUrl("/api/admin/v1/deployment-releases"),
    );
    expect(projection.ok()).toBeTruthy();
    await expect(projection.json()).resolves.toContainEqual(
      expect.objectContaining({
        id: created.id,
        releaseDigest: created.releaseDigest,
      }),
    );
  },
);

function releaseInput(namespace: string) {
  const digest = createHash("sha256").update(namespace).digest("hex");
  const gitSha = digest.slice(0, 40);
  const runId = String(Number.parseInt(digest.slice(0, 10), 16) + 1);
  const ciRunId = String(Number.parseInt(digest.slice(10, 20), 16) + 1);
  const workflowUrl = `https://github.com/sylis/sylis/actions/runs/${runId}`;
  return {
    version: `0.98.${Number.parseInt(digest.slice(20, 26), 16)}`,
    gitSha,
    imageDigests: Object.fromEntries(
      Object.values(DeploymentService).map((service) => [
        service,
        `ghcr.io/sylis/sylis-${service}@sha256:${digest}`,
      ]),
    ),
    stagingEvidence: {
      schemaVersion: DeploymentEvidenceSchemaVersion.V1,
      manifestSchemaVersion: DeploymentManifestSchemaVersion.V1,
      ciRunId,
      releaseWorkflowRunId: runId,
      manifestHash: `sha256:${digest}`,
      commit: gitSha,
      productionSmoke: DeploymentEvidenceResult.SUCCEEDED,
    },
    approvalRef: workflowUrl,
    productionEnvironment: DeploymentEnvironment.PRODUCTION,
    workflowUrl,
    deploymentUrl: "https://sylis.test",
  };
}
