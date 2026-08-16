import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  DeploymentEnvironment,
  PrismaTypes,
  SecurityAuditCategory,
  SecurityAuditResult,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import {
  DeploymentEvidenceResult,
  DeploymentEvidenceSchemaVersion,
  DeploymentIngestServiceIdentity,
  DeploymentManifestSchemaVersion,
  DeploymentService,
} from "@sylis/utils/release-identity";
import { createHash, randomUUID } from "node:crypto";

import { DEPLOYMENT_INGEST_DATABASE } from "./deployment-ingest.database";
import type { IngestDeploymentReleaseDto } from "./deployment.dto";
import { ADMIN_DATABASE } from "../../platform/database/database.module";

interface DeploymentReleaseCandidate {
  version: string;
  gitSha: string;
  imageDigests: Record<string, string>;
  stagingEvidence: Record<string, unknown>;
  releaseDigest: string;
  approvalRef: string;
  productionEnvironment: DeploymentEnvironment;
  workflowUrl: string;
  deploymentUrl: string;
  createdByServiceKey: DeploymentIngestServiceIdentity;
  deployedAt: Date;
}

@Injectable()
export class DeploymentQueryService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
  ) {}

  list() {
    return this.database.deploymentRelease.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}

@Injectable()
export class DeploymentIngestionService {
  constructor(
    @Inject(DEPLOYMENT_INGEST_DATABASE)
    private readonly database: SylisDatabase,
  ) {}

  async ingest(input: IngestDeploymentReleaseDto) {
    const candidate = deploymentReleaseCandidate(input);
    try {
      return await this.database.$transaction(async (transaction) => {
        const existing = await transaction.deploymentRelease.findFirst({
          where: { OR: [{ version: input.version }, { gitSha: input.gitSha }] },
        });
        if (existing) return exactReplay(existing, candidate);

        const release = await transaction.deploymentRelease.create({
          data: {
            ...candidate,
            imageDigests: candidate.imageDigests as PrismaTypes.InputJsonValue,
            stagingEvidence:
              candidate.stagingEvidence as PrismaTypes.InputJsonValue,
          },
        });
        await transaction.$executeRawUnsafe(
          `INSERT INTO "SecurityAuditEvent" (
             "id", "category", "action", "targetType", "targetId",
           "actionDigest", "deploymentId", "result", "metadata"
           ) VALUES (
             $1::uuid, $2::"SecurityAuditCategory", $3, $4, $5::uuid,
             $6, $5::text, $7::"SecurityAuditResult", $8::jsonb
           )`,
          randomUUID(),
          SecurityAuditCategory.DEPLOYMENT,
          "deployment.release.ingested",
          "DeploymentRelease",
          release.id,
          release.releaseDigest,
          SecurityAuditResult.SUCCEEDED,
          JSON.stringify({
            version: release.version,
            gitSha: release.gitSha,
            serviceKey: DeploymentIngestServiceIdentity.GITHUB_ACTIONS,
          }),
        );
        return release;
      });
    } catch (error) {
      if (
        error instanceof PrismaTypes.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.database.deploymentRelease.findFirst({
          where: { OR: [{ version: input.version }, { gitSha: input.gitSha }] },
        });
        if (existing) return exactReplay(existing, candidate);
      }
      throw error;
    }
  }
}

function deploymentReleaseCandidate(
  input: IngestDeploymentReleaseDto,
): DeploymentReleaseCandidate {
  if (input.productionEnvironment !== DeploymentEnvironment.PRODUCTION) {
    throw new BadRequestException("DEPLOYMENT_ENVIRONMENT_INVALID");
  }
  if (!validImageDigests(input.imageDigests)) {
    throw new BadRequestException("DEPLOYMENT_IMAGE_DIGESTS_INVALID");
  }
  if (!validStagingEvidence(input.stagingEvidence, input.gitSha)) {
    throw new BadRequestException("DEPLOYMENT_STAGING_EVIDENCE_INVALID");
  }
  if (
    input.approvalRef !== input.workflowUrl ||
    !validWorkflowUrl(
      input.workflowUrl,
      String(input.stagingEvidence.releaseWorkflowRunId),
    ) ||
    !validHttpsUrl(input.deploymentUrl)
  ) {
    throw new BadRequestException("DEPLOYMENT_LINKS_INVALID");
  }
  const identity = {
    version: input.version,
    gitSha: input.gitSha,
    imageDigests: input.imageDigests,
    stagingEvidence: input.stagingEvidence,
    approvalRef: input.approvalRef,
    productionEnvironment: input.productionEnvironment,
    workflowUrl: input.workflowUrl,
    deploymentUrl: input.deploymentUrl,
    createdByServiceKey: DeploymentIngestServiceIdentity.GITHUB_ACTIONS,
  };
  return {
    ...identity,
    deployedAt: new Date(),
    releaseDigest: digest(identity),
  };
}

function exactReplay<T extends { releaseDigest: string }>(
  existing: T,
  candidate: DeploymentReleaseCandidate,
): T {
  if (existing.releaseDigest !== candidate.releaseDigest) {
    throw new ConflictException("DEPLOYMENT_RELEASE_CONFLICT");
  }
  return existing;
}

function validImageDigests(value: unknown): value is Record<string, string> {
  if (!record(value)) return false;
  const expected = Object.values(DeploymentService).sort();
  const actual = Object.keys(value).sort();
  return (
    canonicalJson(actual) === canonicalJson(expected) &&
    expected.every((service) => {
      const image = value[service];
      return (
        typeof image === "string" &&
        new RegExp(
          `^ghcr\\.io/[a-z0-9._-]+/sylis-${service}@sha256:[a-f0-9]{64}$`,
        ).test(image)
      );
    })
  );
}

function validStagingEvidence(
  value: unknown,
  gitSha: string,
): value is Record<string, unknown> {
  if (!record(value)) return false;
  const expectedKeys = [
    "ciRunId",
    "commit",
    "manifestHash",
    "manifestSchemaVersion",
    "productionSmoke",
    "releaseWorkflowRunId",
    "schemaVersion",
  ].sort();
  return (
    canonicalJson(Object.keys(value).sort()) === canonicalJson(expectedKeys) &&
    value.schemaVersion === DeploymentEvidenceSchemaVersion.V1 &&
    value.manifestSchemaVersion === DeploymentManifestSchemaVersion.V1 &&
    typeof value.ciRunId === "string" &&
    /^[1-9][0-9]*$/.test(value.ciRunId) &&
    typeof value.releaseWorkflowRunId === "string" &&
    /^[1-9][0-9]*$/.test(value.releaseWorkflowRunId) &&
    value.commit === gitSha &&
    typeof value.manifestHash === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(value.manifestHash) &&
    value.productionSmoke === DeploymentEvidenceResult.SUCCEEDED
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validWorkflowUrl(value: string, runId: string): boolean {
  const url = parseHttpsUrl(value);
  return (
    url?.hostname === "github.com" &&
    /^\/[^/]+\/[^/]+\/actions\/runs\/[1-9][0-9]*$/.test(url.pathname) &&
    url.pathname.endsWith(`/actions/runs/${runId}`) &&
    !url.search &&
    !url.hash
  );
}

function validHttpsUrl(value: string): boolean {
  return parseHttpsUrl(value) !== null;
}

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
