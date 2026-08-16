import { DeploymentEnvironment, type SylisDatabase } from "@sylis/database";
import {
  DeploymentEvidenceResult,
  DeploymentEvidenceSchemaVersion,
  DeploymentManifestSchemaVersion,
  DeploymentService,
} from "@sylis/utils/release-identity";
import { describe, expect, it, vi } from "vitest";

import type { IngestDeploymentReleaseDto } from "../src/modules/deployments/deployment.dto";
import {
  DeploymentIngestionService,
  DeploymentQueryService,
} from "../src/modules/deployments/deployment.service";

describe("Deployment release boundary", () => {
  it("DEPLOYMENT-001-UNIT keeps browser reads on Admin DB and ingestion on CI DB", async () => {
    const adminRelease = { id: "admin-release" };
    const adminDatabase = {
      deploymentRelease: {
        findMany: vi.fn().mockResolvedValue([adminRelease]),
      },
    };
    const transaction = {
      deploymentRelease: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "10000000-0000-4000-8000-000000000001",
          ...data,
        })),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
    const ciDatabase = {
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    };

    const query = new DeploymentQueryService(
      adminDatabase as unknown as SylisDatabase,
    );
    const ingestion = new DeploymentIngestionService(
      ciDatabase as unknown as SylisDatabase,
    );

    await expect(query.list()).resolves.toEqual([adminRelease]);
    const release = await ingestion.ingest(releaseInput());

    expect(adminDatabase.deploymentRelease.findMany).toHaveBeenCalledOnce();
    expect(ciDatabase.$transaction).toHaveBeenCalledOnce();
    expect(transaction.deploymentRelease.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdByServiceKey: "github-actions",
        releaseDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
    });
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledOnce();
    expect(release).toMatchObject({
      id: "10000000-0000-4000-8000-000000000001",
      version: "0.0.1",
    });
  });

  it("DEPLOYMENT-002-UNIT accepts only an exact immutable replay", async () => {
    const input = releaseInput();
    const initialTransaction = {
      deploymentRelease: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "20000000-0000-4000-8000-000000000001",
          ...data,
        })),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
    let activeTransaction: object = initialTransaction;
    const database = transactionalDatabase(() => activeTransaction);
    const service = new DeploymentIngestionService(database);
    const created = await service.ingest(input);

    const replayTransaction = {
      deploymentRelease: {
        findFirst: vi.fn().mockResolvedValue(created),
      },
    };
    activeTransaction = replayTransaction;
    await expect(service.ingest(input)).resolves.toEqual(created);

    await expect(
      service.ingest({ ...input, deploymentUrl: "https://other.sylis.test" }),
    ).rejects.toThrow("DEPLOYMENT_RELEASE_CONFLICT");
  });
});

function transactionalDatabase(transaction: () => object): SylisDatabase {
  return {
    $transaction: vi.fn(
      async (operation: (client: object) => Promise<unknown>) =>
        operation(transaction()),
    ),
  } as unknown as SylisDatabase;
}

function releaseInput(): IngestDeploymentReleaseDto {
  const gitSha = "a".repeat(40);
  const releaseWorkflowRunId = "900001";
  return {
    version: "0.0.1",
    gitSha,
    imageDigests: Object.fromEntries(
      Object.values(DeploymentService).map((service) => [
        service,
        `ghcr.io/sylis/sylis-${service}@sha256:${"b".repeat(64)}`,
      ]),
    ),
    stagingEvidence: {
      schemaVersion: DeploymentEvidenceSchemaVersion.V1,
      manifestSchemaVersion: DeploymentManifestSchemaVersion.V1,
      ciRunId: "800001",
      releaseWorkflowRunId,
      manifestHash: `sha256:${"c".repeat(64)}`,
      commit: gitSha,
      productionSmoke: DeploymentEvidenceResult.SUCCEEDED,
    },
    approvalRef: `https://github.com/sylis/sylis/actions/runs/${releaseWorkflowRunId}`,
    productionEnvironment: DeploymentEnvironment.PRODUCTION,
    workflowUrl: `https://github.com/sylis/sylis/actions/runs/${releaseWorkflowRunId}`,
    deploymentUrl: "https://sylis.test",
  };
}
