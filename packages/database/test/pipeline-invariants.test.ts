import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

type TestDatabase = NonNullable<typeof database>;

interface PublishedPilot {
  artifactHash: string;
  artifactUri: string;
  codeVersion: string;
  manifestHash: string;
  runId: string;
  schemaVersion: string;
}

describeDatabase("pipeline database invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("requires FULL builds to use the published PILOT input closure", async () => {
    const pilot = await createPublishedPilot(database!);

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "BuildRun" (
           "id", "mode", "status", "manifestUri", "inputManifestHash",
           "compileProfile", "modelPolicy", "budgetMicros", "forecastHash",
           "codeVersion", "schemaVersion", "requestHash", "pilotEvidenceRunId"
         ) VALUES (
           $1::uuid, 'FULL', 'BUDGET_APPROVAL_PENDING', $2, $3,
           'CORE_20000', '{"enabled": false}'::jsonb, 0, $4,
           $5, $6, $7, $8::uuid
         )`,
        randomUUID(),
        `https://sources.test/${randomUUID()}/manifest.json`,
        pilot.manifestHash,
        hash(randomUUID()),
        `${pilot.codeVersion}-drift`,
        pilot.schemaVersion,
        hash(randomUUID()),
        pilot.runId,
      ),
    ).rejects.toThrow(/FULL_BUILD_PILOT_EVIDENCE_INVALID/);
  });

  it("rejects a BuildRun activation whose Job inputRef is not its owner", async () => {
    const runId = randomUUID();
    const jobId = randomUUID();

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `INSERT INTO "BuildRun" (
             "id", "mode", "status", "manifestUri", "inputManifestHash",
             "compileProfile", "modelPolicy", "budgetMicros", "codeVersion",
             "schemaVersion", "requestHash"
           ) VALUES (
             $1::uuid, 'PILOT', 'APPROVED', $2, $3,
             'PILOT_200', '{"enabled": false}'::jsonb, 0, $4, $5, $6
           )`,
          runId,
          `https://sources.test/${runId}/manifest.json`,
          hash(runId),
          `commit-${runId}`,
          "sylis.lexicon-artifact/1",
          hash(randomUUID()),
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "Job" (
             "id", "kind", "ownerType", "ownerId", "inputRef", "inputHash",
             "idempotencyKey"
           ) VALUES (
             $1::uuid, 'LEXICON_BUILD', 'BUILD_RUN', $2::uuid,
             jsonb_build_object('requestId', $3::text), $4, $5
           )`,
          jobId,
          runId,
          randomUUID(),
          hash(randomUUID()),
          `pipeline-binding-${jobId}`,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "BuildRunActivation" (
             "id", "buildRunId", "jobId", "sequence", "reason"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 'INITIAL')`,
          randomUUID(),
          runId,
          jobId,
        );
      }),
    ).rejects.toThrow(/BUILD_RUN_JOB_BINDING_INVALID/);
  });

  it("only accepts a PUBLISH run for a content-addressed BuildRun Artifact", async () => {
    const runId = randomUUID();
    const jobId = randomUUID();

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `INSERT INTO "Job" (
             "id", "kind", "ownerType", "ownerId", "inputRef", "inputHash",
             "idempotencyKey"
           ) VALUES (
             $1::uuid, 'LEXICON_PUBLISH', 'PUBLISH_RUN', $2::uuid,
             jsonb_build_object('requestId', $2::text), $3, $4
           )`,
          jobId,
          runId,
          hash(randomUUID()),
          `pipeline-publish-${jobId}`,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "PublishRun" (
             "id", "jobId", "artifactUri", "artifactHash", "expectedSchema",
             "mode", "status"
           ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'PUBLISH', 'QUEUED')`,
          runId,
          jobId,
          `s3://lexicon-artifacts/${randomUUID()}.json.zst`,
          hash(randomUUID()),
          "sylis.lexicon-artifact/1",
        );
      }),
    ).rejects.toThrow(/PUBLISH_RUN_ARTIFACT_NOT_PUBLISHED/);
  });

  it("allows a PUBLISH run for the exact published Artifact", async () => {
    const pilot = await createPublishedPilot(database!);
    const runId = randomUUID();
    const jobId = randomUUID();

    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "Job" (
           "id", "kind", "ownerType", "ownerId", "inputRef", "inputHash",
           "idempotencyKey"
         ) VALUES (
           $1::uuid, 'LEXICON_PUBLISH', 'PUBLISH_RUN', $2::uuid,
           jsonb_build_object('requestId', $2::text), $3, $4
         )`,
        jobId,
        runId,
        hash(randomUUID()),
        `pipeline-publish-${jobId}`,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "PublishRun" (
           "id", "jobId", "artifactUri", "artifactHash", "expectedSchema",
           "mode", "status"
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'PUBLISH', 'QUEUED')`,
        runId,
        jobId,
        pilot.artifactUri,
        pilot.artifactHash,
        pilot.schemaVersion,
      );
    });

    await expect(
      database!.publishRun.findUnique({ where: { id: runId } }),
    ).resolves.toMatchObject({ artifactHash: pilot.artifactHash });
  });

  it("does not grant Publisher permission to create release activations", async () => {
    const [privilege] = await database!.$queryRaw<
      Array<{ mayInsertActivation: boolean }>
    >`SELECT has_table_privilege(
        'sylis_lexicon_publisher',
        '"LexiconReleaseActivation"',
        'INSERT'
      ) AS "mayInsertActivation"`;

    expect(privilege?.mayInsertActivation).toBe(false);
  });

  it("DEPLOYMENT-001-INTEGRATION gives only CI append-only release ingestion", async () => {
    const privileges = await database!.$queryRaw<
      Array<{
        roleName: string;
        maySelect: boolean;
        mayInsert: boolean;
        mayUpdate: boolean;
        mayDelete: boolean;
      }>
    >`
      SELECT role_name AS "roleName",
        has_table_privilege(role_name, '"DeploymentRelease"', 'SELECT') AS "maySelect",
        has_table_privilege(role_name, '"DeploymentRelease"', 'INSERT') AS "mayInsert",
        has_table_privilege(role_name, '"DeploymentRelease"', 'UPDATE') AS "mayUpdate",
        has_table_privilege(role_name, '"DeploymentRelease"', 'DELETE') AS "mayDelete"
      FROM unnest(ARRAY['sylis_admin_api', 'sylis_ci_ingestor']) AS role_name
      ORDER BY role_name
    `;

    expect(privileges).toEqual([
      {
        roleName: "sylis_admin_api",
        maySelect: true,
        mayInsert: false,
        mayUpdate: false,
        mayDelete: false,
      },
      {
        roleName: "sylis_ci_ingestor",
        maySelect: true,
        mayInsert: true,
        mayUpdate: false,
        mayDelete: false,
      },
    ]);

    await expect(
      insertDeploymentReleaseAs("sylis_admin_api", false),
    ).rejects.toThrow(/permission denied/);
    await expect(
      insertDeploymentReleaseAs("sylis_ci_ingestor", false),
    ).rejects.toThrow(/DEPLOYMENT_RELEASE_AUDIT_CLOSURE_INVALID/);

    const release = await insertDeploymentReleaseAs("sylis_ci_ingestor", true);
    await expect(
      database!.$executeRawUnsafe(
        'UPDATE "DeploymentRelease" SET "deploymentUrl" = $2 WHERE "id" = $1::uuid',
        release.id,
        "https://changed-by-owner.sylis.test",
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          'SET LOCAL ROLE "sylis_ci_ingestor"',
        );
        await transaction.$executeRawUnsafe(
          'UPDATE "DeploymentRelease" SET "deploymentUrl" = $2 WHERE "id" = $1::uuid',
          release.id,
          "https://changed.sylis.test",
        );
      }),
    ).rejects.toThrow(/permission denied|append-only/);
  });
});

async function insertDeploymentReleaseAs(
  role: "sylis_admin_api" | "sylis_ci_ingestor",
  includeAudit: boolean,
): Promise<{ id: string; releaseDigest: string }> {
  const id = randomUUID();
  const version = `0.99.${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const gitSha = hash(randomUUID()).slice("sha256:".length, 47);
  const releaseDigest = hash(randomUUID());
  const workflowRunId = String(Date.now());
  const imageDigests = Object.fromEntries(
    [
      "admin",
      "admin-api",
      "agent-api",
      "agent-evaluator",
      "agent-executor",
      "api",
      "asset-processor",
      "automation-executor",
      "lexicon-builder",
      "lexicon-publisher",
      "model-gateway",
      "web",
    ].map((service) => [
      service,
      `ghcr.io/sylis/sylis-${service}@sha256:${"a".repeat(64)}`,
    ]),
  );
  const stagingEvidence = {
    schemaVersion: "sylis.deployment-evidence/1",
    manifestSchemaVersion: "sylis.deployment-manifest/1",
    ciRunId: String(Date.now() - 1),
    releaseWorkflowRunId: workflowRunId,
    manifestHash: hash(randomUUID()),
    commit: gitSha,
    productionSmoke: "SUCCEEDED",
  };

  await database!.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
    await transaction.$executeRawUnsafe(
      `INSERT INTO "DeploymentRelease" (
         "id", "version", "gitSha", "imageDigests", "stagingEvidence",
         "releaseDigest", "approvalRef", "productionEnvironment",
         "workflowUrl", "deploymentUrl", "createdByServiceKey", "deployedAt"
       ) VALUES (
         $1::uuid, $2, $3, $4::jsonb, $5::jsonb,
         $6, $7, 'PRODUCTION', $7, $8, 'github-actions', now()
       )`,
      id,
      version,
      gitSha,
      JSON.stringify(imageDigests),
      JSON.stringify(stagingEvidence),
      releaseDigest,
      `https://github.com/sylis/sylis/actions/runs/${workflowRunId}`,
      "https://sylis.test",
    );
    if (includeAudit) {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "SecurityAuditEvent" (
           "id", "category", "action", "targetType", "targetId",
           "actionDigest", "deploymentId", "result", "metadata"
         ) VALUES (
           $1::uuid, 'DEPLOYMENT', 'deployment.release.ingested',
           'DeploymentRelease', $2::uuid, $3, $2::text, 'SUCCEEDED', $4::jsonb
         )`,
        randomUUID(),
        id,
        releaseDigest,
        JSON.stringify({ version, gitSha, serviceKey: "github-actions" }),
      );
    }
  });

  return { id, releaseDigest };
}

async function createPublishedPilot(
  client: TestDatabase,
): Promise<PublishedPilot> {
  const runId = randomUUID();
  const jobId = randomUUID();
  const manifestHash = hash(randomUUID());
  const artifactHash = hash(randomUUID());
  const artifactUri = `s3://lexicon-artifacts/${artifactHash.slice(7)}.json.zst`;
  const codeVersion = `commit-${runId}`;
  const schemaVersion = "sylis.lexicon-artifact/1";

  await client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO "BuildRun" (
         "id", "mode", "status", "manifestUri", "inputManifestHash",
         "compileProfile", "modelPolicy", "budgetMicros", "codeVersion",
         "schemaVersion", "requestHash"
       ) VALUES (
         $1::uuid, 'PILOT', 'APPROVED', $2, $3,
         'PILOT_200', '{"enabled": false}'::jsonb, 0, $4, $5, $6
       )`,
      runId,
      `https://sources.test/${runId}/manifest.json`,
      manifestHash,
      codeVersion,
      schemaVersion,
      hash(randomUUID()),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Job" (
         "id", "kind", "ownerType", "ownerId", "inputRef", "inputHash",
         "idempotencyKey"
       ) VALUES (
         $1::uuid, 'LEXICON_BUILD', 'BUILD_RUN', $2::uuid,
         jsonb_build_object('requestId', $2::text), $3, $4
       )`,
      jobId,
      runId,
      hash(randomUUID()),
      `pipeline-build-${jobId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "BuildRunActivation" (
         "id", "buildRunId", "jobId", "sequence", "reason"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 'INITIAL')`,
      randomUUID(),
      runId,
      jobId,
    );
    await transaction.$executeRawUnsafe(
      `UPDATE "BuildRun"
       SET "status" = 'ARTIFACT_PUBLISHED',
           "artifactUri" = $2,
           "artifactHash" = $3,
           "compilerRunId" = $4,
           "completedAt" = now()
       WHERE "id" = $1::uuid`,
      runId,
      artifactUri,
      artifactHash,
      randomUUID(),
    );
  });

  return {
    artifactHash,
    artifactUri,
    codeVersion,
    manifestHash,
    runId,
    schemaVersion,
  };
}

function hash(value: string): string {
  return `sha256:${value.replaceAll("-", "").padEnd(64, "0").slice(0, 64)}`;
}
