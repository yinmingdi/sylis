import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import {
  createPrismaClient,
  JobFailureClass,
  JobKind,
  JobStatus,
  OperatorRole,
} from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describeDatabase("v0.0.1 database invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("seeds one effective operator policy for every Job kind", async () => {
    const policies = await database!.jobKindPolicy.findMany({
      where: { policyVersion: "job-policy/v0.0.1" },
    });
    expect(policies).toHaveLength(19);
    expect(
      policies.find((policy) => policy.jobKind === JobKind.SOURCE_SYNC),
    ).toMatchObject({
      cancellable: true,
      cancelAllowedStatuses: expect.arrayContaining([JobStatus.RUNNING]),
      retryAllowedStatuses: [JobStatus.FAILED],
      retryableFailureClasses: expect.arrayContaining([
        JobFailureClass.TRANSIENT,
        JobFailureClass.PERMANENT,
      ]),
      requiredOperatorRoles: [OperatorRole.LEXICON_OPERATOR],
    });
    expect(
      policies.find((policy) => policy.jobKind === JobKind.RETENTION_PURGE),
    ).toMatchObject({ cancellable: false, cancelAllowedStatuses: [] });
  });

  it("enforces credential ownership and one default notebook", async () => {
    const userId = randomUUID();
    const firstNotebookId = randomUUID();

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "CredentialProfile" ("id", "ownerKind", "providerKey", "label")
         VALUES ($1::uuid, 'USER', 'e2e-provider', 'invalid-owner')`,
        randomUUID(),
      ),
    ).rejects.toThrow(/CredentialProfile_owner_xor_check/);

    await database!.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "displayName") VALUES ($1::uuid, 'Database invariant')`,
      userId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "Notebook" ("id", "userId", "name", "isDefault", "updatedAt")
       VALUES ($1::uuid, $2::uuid, 'Default one', true, now())`,
      firstNotebookId,
      userId,
    );
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "Notebook" ("id", "userId", "name", "isDefault", "updatedAt")
         VALUES ($1::uuid, $2::uuid, 'Default two', true, now())`,
        randomUUID(),
        userId,
      ),
    ).rejects.toThrow(/userId[\s\S]*already exists/);

    await database!.$executeRawUnsafe(
      `UPDATE "Notebook" SET "retiredAt" = now() WHERE "id" = $1::uuid`,
      firstNotebookId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "Notebook" ("id", "userId", "name", "isDefault", "updatedAt")
       VALUES ($1::uuid, $2::uuid, 'default ONE', true, now())`,
      randomUUID(),
      userId,
    );
  });

  it("keeps collected-item current revisions owned and exactly typed", async () => {
    const userId = randomUUID();
    const notebookId = randomUUID();

    await database!.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "displayName") VALUES ($1::uuid, 'Notebook invariant')`,
      userId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "Notebook" ("id", "userId", "name", "updatedAt")
       VALUES ($1::uuid, $2::uuid, 'Invariant notebook', now())`,
      notebookId,
      userId,
    );

    await expect(
      database!.$transaction(async (transaction) => {
        const firstItemId = randomUUID();
        const secondItemId = randomUUID();
        const secondRevisionId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "CollectedLexicalItem" ("id", "notebookId", "position")
           VALUES ($1::uuid, $3::uuid, 0), ($2::uuid, $3::uuid, 1)`,
          firstItemId,
          secondItemId,
          notebookId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "CollectedLexicalItemRevision" (
             "id", "collectedItemId", "revisionNo", "source", "tags",
             "contentHash", "createdBy"
           ) VALUES ($1::uuid, $2::uuid, 1, 'USER', ARRAY[]::text[], $3, $4)`,
          secondRevisionId,
          secondItemId,
          "0".repeat(64),
          userId,
        );
        await transaction.$executeRawUnsafe(
          `UPDATE "CollectedLexicalItem" SET "currentRevisionId" = $1::uuid
           WHERE "id" = $2::uuid`,
          secondRevisionId,
          firstItemId,
        );
      }),
    ).rejects.toThrow(/CollectedLexicalItem_id_currentRevisionId_fkey/);

    await expect(
      database!.$transaction(async (transaction) => {
        const itemId = randomUUID();
        const revisionId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "CollectedLexicalItem" ("id", "notebookId", "position")
           VALUES ($1::uuid, $2::uuid, 0)`,
          itemId,
          notebookId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "CollectedLexicalItemRevision" (
             "id", "collectedItemId", "revisionNo", "source", "tags",
             "contentHash", "createdBy"
           ) VALUES ($1::uuid, $2::uuid, 1, 'USER', ARRAY[]::text[], $3, $4)`,
          revisionId,
          itemId,
          "0".repeat(64),
          userId,
        );
        await transaction.$executeRawUnsafe(
          `UPDATE "CollectedLexicalItem" SET "currentRevisionId" = $1::uuid
           WHERE "id" = $2::uuid`,
          revisionId,
          itemId,
        );
      }),
    ).rejects.toThrow(/COLLECTED_REVISION_TARGET_COUNT_INVALID/);
  });

  it("rejects updates to append-only audit evidence", async () => {
    const eventId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "SecurityAuditEvent" (
         "id", "category", "action", "result", "metadata"
       ) VALUES ($1::uuid, 'SECURITY', 'invariant.test', 'SUCCEEDED', '{}'::jsonb)`,
      eventId,
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "SecurityAuditEvent" SET "action" = 'invariant.changed' WHERE "id" = $1::uuid`,
        eventId,
      ),
    ).rejects.toThrow(/AUDIT_EVENT_IMMUTABLE/);
  });

  it("rejects a stale attempt writing progress", async () => {
    const jobId = randomUUID();
    const firstAttemptId = randomUUID();
    const secondAttemptId = randomUUID();

    await database!.$executeRawUnsafe(
      `INSERT INTO "Job" (
         "id", "kind", "ownerType", "ownerId", "status", "inputRef",
         "inputHash", "idempotencyKey"
       ) VALUES (
         $1::uuid, 'DATA_EXPORT', 'USER_EXPORT', $2::uuid, 'RUNNING', '{}'::jsonb,
         'sha256:invariant-input', $3
       )`,
      jobId,
      randomUUID(),
      `invariant-fencing-${jobId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "JobAttempt" (
         "id", "jobId", "attemptNumber", "handlerVersion",
         "checkpointSchemaVersion", "leaseOwner", "leaseToken",
         "leaseExpiresAt", "heartbeatAt", "fencingToken", "status"
       ) VALUES (
         $1::uuid, $2::uuid, 1, 'data-export/1', '1', 'worker-one', $3,
         now() - interval '1 second', now() - interval '2 seconds',
         nextval('job_fencing_token_seq'), 'UNKNOWN_OUTCOME'
       )`,
      firstAttemptId,
      jobId,
      randomUUID(),
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "JobAttempt" (
         "id", "jobId", "attemptNumber", "handlerVersion",
         "checkpointSchemaVersion", "leaseOwner", "leaseToken",
         "leaseExpiresAt", "heartbeatAt", "fencingToken"
       ) VALUES (
         $1::uuid, $2::uuid, 2, 'data-export/1', '1', 'worker-two', $3,
         now() + interval '1 minute', now(), nextval('job_fencing_token_seq')
       )`,
      secondAttemptId,
      jobId,
      randomUUID(),
    );

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "JobProgressEvent" (
           "id", "jobId", "attemptId", "sequence", "eventType", "stage", "processed"
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, 1, 'job.progress', 'STALE', 0
         )`,
        randomUUID(),
        jobId,
        firstAttemptId,
      ),
    ).rejects.toThrow(/JOB_FENCING_TOKEN_STALE/);
  });

  it("keeps terminal Job rows immutable", async () => {
    const jobId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "Job" (
         "id", "kind", "ownerType", "ownerId", "status", "inputRef",
         "inputHash", "idempotencyKey"
       ) VALUES (
         $1::uuid, 'DATA_EXPORT', 'USER_EXPORT', $2::uuid, 'RUNNING', '{}'::jsonb,
         'sha256:terminal-input', $3
       )`,
      jobId,
      randomUUID(),
      `invariant-terminal-${jobId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "JobAttempt" (
         "id", "jobId", "attemptNumber", "handlerVersion",
         "checkpointSchemaVersion", "leaseOwner", "leaseToken",
         "leaseExpiresAt", "heartbeatAt", "fencingToken", "status",
         "failureClass", "completedAt"
       ) VALUES (
         $1::uuid, $2::uuid, 1, 'data-export/1', '1', 'worker', $3,
         now() + interval '1 minute', now(), nextval('job_fencing_token_seq'),
         'FAILED', 'PERMANENT', now()
       )`,
      randomUUID(),
      jobId,
      randomUUID(),
    );
    await database!.$executeRawUnsafe(
      `UPDATE "Job" SET "status" = 'FAILED', "completedAt" = now()
       WHERE "id" = $1::uuid`,
      jobId,
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "Job" SET "priority" = 99 WHERE "id" = $1::uuid`,
        jobId,
      ),
    ).rejects.toThrow(/JOB_TERMINAL_IMMUTABLE/);
  });

  it("denies an executor direct writes to Agent truth", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL ROLE sylis_agent_executor",
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AgentSession" (
             "id", "userId", "title", "nextMessageSequence", "nextEventSequence"
           ) VALUES ($1::uuid, $2::uuid, 'forbidden', 1, 1)`,
          randomUUID(),
          randomUUID(),
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("denies non-identity services access to password hashes", async () => {
    for (const role of ["sylis_agent_api", "sylis_automation_executor"]) {
      await expect(
        database!.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await transaction.$queryRawUnsafe(
            `SELECT "hash" FROM "PasswordCredential" LIMIT 1`,
          );
        }),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("lets Agent API enqueue Agent work without pipeline table access", async () => {
    const jobId = randomUUID();
    const runId = randomUUID();

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_agent_api");
        await transaction.$executeRawUnsafe(
          `INSERT INTO "Job" (
             "id", "kind", "ownerType", "ownerId", "inputRef",
             "inputHash", "idempotencyKey"
           ) VALUES (
             $1::uuid, 'AGENT_RUN_ACTIVATION', 'AGENT_RUN', $2::uuid,
             jsonb_build_object('requestId', $2::text), $3, $4
           )`,
          jobId,
          runId,
          `sha256:${"a".repeat(64)}`,
          `agent-api-pipeline-boundary-${jobId}`,
        );
        return jobId;
      }),
    ).resolves.toBe(jobId);

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_agent_api");
        await transaction.$queryRawUnsafe(
          `SELECT "buildRunId" FROM "BuildRunActivation" LIMIT 1`,
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("enforces least-privilege audit and Lexicon service boundaries", async () => {
    const privileges = await database!.$queryRaw<
      Array<{
        modelAuditInsert: boolean;
        modelAuditSelect: boolean;
        automationSecuritySelect: boolean;
        automationDataAccessSelect: boolean;
        automationSecurityInsert: boolean;
        automationDataAccessInsert: boolean;
        adminActiveReleaseUpdate: boolean;
        adminLexiconKeyUpdate: boolean;
        adminAgentRunIdSelect: boolean;
        adminAgentRunParentSelect: boolean;
        adminAgentRunStatusSelect: boolean;
        adminAgentRunGoalSelect: boolean;
        adminReleaseSourceInputSelect: boolean;
        publisherActiveReleaseUpdate: boolean;
        publisherLexiconInsert: boolean;
        publisherReleaseStatusUpdate: boolean;
        publisherReleaseContentHashUpdate: boolean;
        publisherStagingDelete: boolean;
        prismaMigrationHistoryAbsent: boolean;
        agentAuditInsert: boolean;
        agentDataAccessAuditInsert: boolean;
      }>
    >`
      SELECT
        has_table_privilege(
          'sylis_model_gateway', '"SecurityAuditEvent"', 'INSERT'
        ) AS "modelAuditInsert",
        has_table_privilege(
          'sylis_model_gateway', '"SecurityAuditEvent"', 'SELECT'
        ) AS "modelAuditSelect",
        has_table_privilege(
          'sylis_automation_executor', '"SecurityAuditEvent"', 'SELECT'
        ) AS "automationSecuritySelect",
        has_table_privilege(
          'sylis_automation_executor', '"DataAccessAuditEvent"', 'SELECT'
        ) AS "automationDataAccessSelect",
        has_table_privilege(
          'sylis_automation_executor', '"SecurityAuditEvent"', 'INSERT'
        ) AS "automationSecurityInsert",
        has_table_privilege(
          'sylis_automation_executor', '"DataAccessAuditEvent"', 'INSERT'
        ) AS "automationDataAccessInsert",
        has_column_privilege(
          'sylis_admin_api', '"Lexicon"', 'activeReleaseId', 'UPDATE'
        ) AS "adminActiveReleaseUpdate",
        has_column_privilege(
          'sylis_admin_api', '"Lexicon"', 'key', 'UPDATE'
        ) AS "adminLexiconKeyUpdate",
        has_column_privilege(
          'sylis_admin_api', '"AgentRun"', 'id', 'SELECT'
        ) AS "adminAgentRunIdSelect",
        has_column_privilege(
          'sylis_admin_api', '"AgentRun"', 'parentRunId', 'SELECT'
        ) AS "adminAgentRunParentSelect",
        has_column_privilege(
          'sylis_admin_api', '"AgentRun"', 'status', 'SELECT'
        ) AS "adminAgentRunStatusSelect",
        has_column_privilege(
          'sylis_admin_api', '"AgentRun"', 'goalContentBodyId', 'SELECT'
        ) AS "adminAgentRunGoalSelect",
        has_table_privilege(
          'sylis_admin_api', '"LexiconReleaseSourceInput"', 'SELECT'
        ) AS "adminReleaseSourceInputSelect",
        has_column_privilege(
          'sylis_lexicon_publisher', '"Lexicon"', 'activeReleaseId', 'UPDATE'
        ) AS "publisherActiveReleaseUpdate",
        has_table_privilege(
          'sylis_lexicon_publisher', '"Lexicon"', 'INSERT'
        ) AS "publisherLexiconInsert",
        has_column_privilege(
          'sylis_lexicon_publisher', '"LexiconRelease"', 'status', 'UPDATE'
        ) AS "publisherReleaseStatusUpdate",
        has_column_privilege(
          'sylis_lexicon_publisher', '"LexiconRelease"', 'contentHash', 'UPDATE'
        ) AS "publisherReleaseContentHashUpdate",
        has_table_privilege(
          'sylis_lexicon_publisher', '"LexiconStagingRecord"', 'DELETE'
        ) AS "publisherStagingDelete",
        to_regclass('public._prisma_migrations') IS NULL
          AS "prismaMigrationHistoryAbsent",
        has_table_privilege(
          'sylis_agent_api', '"SecurityAuditEvent"', 'INSERT'
        ) AS "agentAuditInsert",
        has_table_privilege(
          'sylis_agent_api', '"DataAccessAuditEvent"', 'INSERT'
        ) AS "agentDataAccessAuditInsert"
    `;

    expect(privileges).toEqual([
      {
        modelAuditInsert: true,
        modelAuditSelect: false,
        automationSecuritySelect: true,
        automationDataAccessSelect: true,
        automationSecurityInsert: false,
        automationDataAccessInsert: false,
        adminActiveReleaseUpdate: true,
        adminLexiconKeyUpdate: false,
        adminAgentRunIdSelect: true,
        adminAgentRunParentSelect: true,
        adminAgentRunStatusSelect: true,
        adminAgentRunGoalSelect: false,
        adminReleaseSourceInputSelect: true,
        publisherActiveReleaseUpdate: false,
        publisherLexiconInsert: true,
        publisherReleaseStatusUpdate: true,
        publisherReleaseContentHashUpdate: false,
        publisherStagingDelete: true,
        prismaMigrationHistoryAbsent: true,
        agentAuditInsert: true,
        agentDataAccessAuditInsert: true,
      },
    ]);
  });

  it("keeps Model Exchange lifecycle writes owned by Model Gateway", async () => {
    for (const role of ["sylis_agent_api", "sylis_automation_executor"]) {
      await expect(
        database!.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await transaction.$executeRawUnsafe(
            `UPDATE "ModelExchange" SET "hiddenAt" = now()
             WHERE "id" = $1::uuid`,
            randomUUID(),
          );
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        database!.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await transaction.$executeRawUnsafe(
            `UPDATE "ModelContentBody" SET "purgedAt" = now()
             WHERE "id" = $1::uuid`,
            randomUUID(),
          );
        }),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("RELEASE-001-INTEGRATION keeps an active release owned by its active Lexicon", async () => {
    const firstLexiconId = randomUUID();
    const secondLexiconId = randomUUID();
    const releaseId = randomUUID();
    const textProfileId = randomUUID();
    const vocabularyBundleId = randomUUID();

    await database!.$executeRawUnsafe(
      `INSERT INTO "TextProcessingProfile" (
         "id", "unicodeVersion", "cldrVersion", "icuVersion", "ucaVersion",
         "normalizationForm", "segmentationAlgorithm", "locale", "collation", "contentHash"
       ) VALUES (
         $1::uuid, '16', '46', '76', '16', 'NFC', 'uax29', 'en', 'root', $2
       )`,
      textProfileId,
      `sha256:text-profile-${textProfileId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "VocabularyBundle" ("id", "version", "contentHash")
       VALUES ($1::uuid, 'invariant-test', $2)`,
      vocabularyBundleId,
      `sha256:vocabulary-${vocabularyBundleId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "Lexicon" (
         "id", "key", "sourceLanguageTag", "updatedAt"
       ) VALUES
         ($1::uuid, $3, 'en', now()),
         ($2::uuid, $4, 'en', now())`,
      firstLexiconId,
      secondLexiconId,
      `invariant-first-${firstLexiconId}`,
      `invariant-second-${secondLexiconId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "LexiconRelease" (
         "id", "lexiconId", "version", "status", "textProfileId",
         "vocabularyBundleId", "compressedArtifactHash", "contentHash",
         "canonicalizerVersion", "validatedAt"
       ) VALUES (
         $1::uuid, $2::uuid, 'invariant-test', 'VALIDATED', $3::uuid,
         $4::uuid, $5, $6, 'invariant-test', now()
       )`,
      releaseId,
      firstLexiconId,
      textProfileId,
      vocabularyBundleId,
      `sha256:compressed-${releaseId}`,
      `sha256:content-${releaseId}`,
    );
    await database!.$executeRawUnsafe(
      `UPDATE "Lexicon" SET "activeReleaseId" = $1::uuid WHERE "id" = $2::uuid`,
      releaseId,
      firstLexiconId,
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "LexiconRelease" SET "lexiconId" = $1::uuid WHERE "id" = $2::uuid`,
        secondLexiconId,
        releaseId,
      ),
    ).rejects.toThrow(/LEXICON_ACTIVE_RELEASE_MUST_REMAIN_VALIDATED/);
  });

  it("enforces the Lexicon release lifecycle without compatibility transitions", async () => {
    const lexiconId = randomUUID();
    const releaseId = randomUUID();
    const textProfileId = randomUUID();
    const vocabularyBundleId = randomUUID();

    await database!.$executeRawUnsafe(
      `INSERT INTO "TextProcessingProfile" (
         "id", "unicodeVersion", "cldrVersion", "icuVersion", "ucaVersion",
         "normalizationForm", "segmentationAlgorithm", "locale", "collation", "contentHash"
       ) VALUES (
         $1::uuid, '16', '46', '76', '16', 'NFC', 'uax29', 'en', 'root', $2
       )`,
      textProfileId,
      `sha256:text-profile-${textProfileId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "VocabularyBundle" ("id", "version", "contentHash")
       VALUES ($1::uuid, 'invariant-lifecycle', $2)`,
      vocabularyBundleId,
      `sha256:vocabulary-${vocabularyBundleId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "Lexicon" ("id", "key", "sourceLanguageTag", "updatedAt")
       VALUES ($1::uuid, $2, 'en', now())`,
      lexiconId,
      `invariant-lifecycle-${lexiconId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "LexiconRelease" (
         "id", "lexiconId", "version", "status", "textProfileId",
         "vocabularyBundleId", "compressedArtifactHash", "contentHash",
         "canonicalizerVersion"
       ) VALUES (
         $1::uuid, $2::uuid, 'invariant-lifecycle', 'DRAFT', $3::uuid,
         $4::uuid, $5, $6, 'invariant-test'
       )`,
      releaseId,
      lexiconId,
      textProfileId,
      vocabularyBundleId,
      `sha256:compressed-${releaseId}`,
      `sha256:content-${releaseId}`,
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "LexiconRelease" SET "status" = 'VALIDATED' WHERE "id" = $1::uuid`,
        releaseId,
      ),
    ).rejects.toThrow(/LEXICON_RELEASE_TRANSITION_INVALID:DRAFT:VALIDATED/);

    await database!.$executeRawUnsafe(
      `UPDATE "LexiconRelease" SET "status" = 'VALIDATING' WHERE "id" = $1::uuid`,
      releaseId,
    );
    await database!.$executeRawUnsafe(
      `UPDATE "LexiconRelease" SET "status" = 'VALIDATED' WHERE "id" = $1::uuid`,
      releaseId,
    );
    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "LexiconRelease" SET "status" = 'VALIDATING' WHERE "id" = $1::uuid`,
        releaseId,
      ),
    ).rejects.toThrow(
      /LEXICON_RELEASE_TRANSITION_INVALID:VALIDATED:VALIDATING/,
    );
  });

  it("rejects activation when an applicable source restriction is effective", async () => {
    const fixture = await createReleaseWithSourceInput();
    const unrelatedVersionId = randomUUID();
    const mismatchedPolicyId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "SourceRightsPolicy" (
         "id", "key", "version", "mayBuild", "mayServe", "mayExport",
         "requiresAttribution", "effectiveFrom"
       ) VALUES ($1::uuid, $2, '1', true, true, true, false, now())`,
      mismatchedPolicyId,
      `mismatch-${mismatchedPolicyId}`,
    );
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "SourceRestriction" (
           "id", "rightsPolicyId", "datasetVersionId", "restrictionKind",
           "reason", "effectiveAt"
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, 'BLOCK_SERVE', 'Mismatched policy', now()
         )`,
        randomUUID(),
        mismatchedPolicyId,
        fixture.datasetVersionId,
      ),
    ).rejects.toThrow(/SOURCE_RESTRICTION_POLICY_VERSION_MISMATCH/);
    await database!.$executeRawUnsafe(
      `INSERT INTO "SourceDatasetVersion" (
         "id", "datasetId", "version", "sourceUri", "checksum", "retrievedAt",
         "adapter", "parserVersion", "schemaVersion", "validationSummary",
         "rightsPolicyId", "status"
       ) VALUES (
         $1::uuid, $2::uuid, 'unrelated', 'https://example.invalid/unrelated',
         $3, now(), 'test', '1', '1', '{}'::jsonb, $4::uuid, 'VALIDATED'
       )`,
      unrelatedVersionId,
      fixture.datasetId,
      `sha256:dataset:${unrelatedVersionId}`,
      fixture.rightsPolicyId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "SourceRestriction" (
         "id", "rightsPolicyId", "datasetVersionId", "restrictionKind",
         "reason", "effectiveAt"
       ) VALUES
         ($1::uuid, $2::uuid, $3::uuid, 'BLOCK_SERVE', 'Other version', now() - interval '1 minute'),
         ($4::uuid, $2::uuid, NULL, 'BLOCK_SERVE', 'Future policy restriction', now() + interval '1 day')`,
      randomUUID(),
      fixture.rightsPolicyId,
      unrelatedVersionId,
      randomUUID(),
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "Lexicon" SET "activeReleaseId" = $1::uuid
         WHERE "id" = $2::uuid`,
        fixture.releaseId,
        fixture.lexiconId,
      ),
    ).resolves.toBe(1);
    await database!.$executeRawUnsafe(
      `UPDATE "Lexicon" SET "activeReleaseId" = NULL WHERE "id" = $1::uuid`,
      fixture.lexiconId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "SourceRestriction" (
         "id", "rightsPolicyId", "datasetVersionId", "restrictionKind",
         "reason", "effectiveAt"
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, 'BLOCK_SERVE', 'Exact source version',
         now() - interval '1 minute'
       )`,
      randomUUID(),
      fixture.rightsPolicyId,
      fixture.datasetVersionId,
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "Lexicon" SET "activeReleaseId" = $1::uuid
         WHERE "id" = $2::uuid`,
        fixture.releaseId,
        fixture.lexiconId,
      ),
    ).rejects.toThrow(/LEXICON_RELEASE_ACTIVATION_SOURCE_RESTRICTED/);
  });

  it("lets Agent API read Job progress for Agent run projections", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_agent_api");
        await transaction.$queryRawUnsafe(
          `SELECT * FROM "JobProgressEvent" LIMIT 1`,
        );
      }),
    ).resolves.toBeUndefined();
  });

  it("lets Agent API read normalized Agent step and message block truth", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_agent_api");
        for (const table of [
          "AgentRunStep",
          "AgentRunStepAction",
          "AgentMessageBlock",
          "AgentMessageBlockContent",
          "AgentMessageBlockTable",
          "AgentMessageBlockTableRow",
          "AgentMessageBlockTableCell",
          "AgentMessageBlockDivider",
          "AgentMessageBlockReference",
        ]) {
          await transaction.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 0`);
        }
      }),
    ).resolves.toBeUndefined();
  });

  it("lets Agent API verify Model invocation and fragment references without envelope access", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_agent_api");
        await transaction.$queryRawUnsafe(
          `SELECT fragment."id"
           FROM "ModelContentFragment" fragment
           JOIN "ModelContentBody" body ON body."id" = fragment."bodyId"
           JOIN "ModelInvocation" invocation ON invocation."id" = fragment."invocationId"
           JOIN "ModelExecutionPermit" permit ON permit."id" = invocation."permitId"
           JOIN "ModelExecutionPermitAgentRunTarget" target
             ON target."permitId" = permit."id"
           WHERE body."ownerUserId" IS NOT NULL
             AND body."hiddenAt" IS NULL
             AND body."purgedAt" IS NULL
             AND body."sealedAt" IS NOT NULL
             AND invocation."ownerType" = 'AGENT_RUN'
             AND invocation."status" = 'SUCCEEDED'
             AND fragment."modelPosition" >= 0
             AND fragment."modelSubPosition" >= 0
             AND fragment."fragmentSequence" >= 0
             AND fragment."fragmentHash" IS NOT NULL
             AND fragment."byteLength" > 0
             AND target."agentRunId" = invocation."ownerId"
           LIMIT 0`,
        );
      }),
    ).resolves.toBeUndefined();
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_agent_api");
        await transaction.$queryRawUnsafe(
          `SELECT "ciphertext" FROM "ModelContentFragment" LIMIT 0`,
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets Model Gateway validate Agent-run permit ownership", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL ROLE sylis_model_gateway",
        );
        await transaction.$queryRawUnsafe(
          `SELECT "id", "userId" FROM "AgentSession" LIMIT 1`,
        );
      }),
    ).resolves.toBeUndefined();
  });

  it("lets Admin Job Runtime settle Agent waits", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_admin_api");
        await transaction.$queryRawUnsafe(
          `SELECT "id", "runId", "status" FROM "AgentWaitCondition" LIMIT 1`,
        );
        await transaction.$executeRawUnsafe(
          `UPDATE "AgentRun"
           SET "status" = 'WAITING', "waitedAt" = now()
           WHERE false`,
        );
      }),
    ).resolves.toBeUndefined();
  });

  it("lets Admin API validate approval roles without reading operator metadata", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_admin_api");
        await transaction.$queryRawUnsafe(
          `SELECT "sylis_operator_satisfies_role_expression"(
             $1::uuid, 'LEXICON_OPERATOR', statement_timestamp()
           )`,
          randomUUID(),
        );
      }),
    ).resolves.toBeUndefined();

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_admin_api");
        await transaction.$queryRawUnsafe(
          `SELECT "reason" FROM "OperatorRoleAssignment" LIMIT 1`,
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets Admin API activate a Lexicon without editing its identity", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_admin_api");
        await transaction.$executeRawUnsafe(
          `UPDATE "Lexicon"
           SET "activeReleaseId" = NULL, "updatedAt" = now()
           WHERE false`,
        );
      }),
    ).resolves.toBeUndefined();

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_admin_api");
        await transaction.$executeRawUnsafe(
          `UPDATE "Lexicon" SET "key" = "key" WHERE false`,
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

async function createReleaseWithSourceInput(): Promise<{
  datasetId: string;
  datasetVersionId: string;
  lexiconId: string;
  releaseId: string;
  rightsPolicyId: string;
}> {
  const textProfileId = randomUUID();
  const vocabularyBundleId = randomUUID();
  const lexiconId = randomUUID();
  const releaseId = randomUUID();
  const rightsPolicyId = randomUUID();
  const datasetId = randomUUID();
  const datasetVersionId = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "TextProcessingProfile" (
       "id", "unicodeVersion", "cldrVersion", "icuVersion", "ucaVersion",
       "normalizationForm", "segmentationAlgorithm", "locale", "collation", "contentHash"
     ) VALUES (
       $1::uuid, '16', '46', '76', '16', 'NFC', 'uax29', 'en', 'root', $2
     )`,
    textProfileId,
    `sha256:text-profile:${textProfileId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "VocabularyBundle" ("id", "version", "contentHash")
     VALUES ($1::uuid, $2, $3)`,
    vocabularyBundleId,
    `restriction-${vocabularyBundleId}`,
    `sha256:vocabulary:${vocabularyBundleId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "Lexicon" ("id", "key", "sourceLanguageTag", "updatedAt")
     VALUES ($1::uuid, $2, 'en', now())`,
    lexiconId,
    `restriction-${lexiconId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "SourceRightsPolicy" (
       "id", "key", "version", "mayBuild", "mayServe", "mayExport",
       "requiresAttribution", "effectiveFrom"
     ) VALUES ($1::uuid, $2, '1', true, true, true, false, now())`,
    rightsPolicyId,
    `restriction-${rightsPolicyId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "SourceDataset" ("id", "key", "name", "homepageUri")
     VALUES ($1::uuid, $2, 'Restricted source', 'https://example.invalid')`,
    datasetId,
    `restriction-${datasetId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "SourceDatasetVersion" (
       "id", "datasetId", "version", "sourceUri", "checksum", "retrievedAt",
       "adapter", "parserVersion", "schemaVersion", "validationSummary",
       "rightsPolicyId", "status"
     ) VALUES (
       $1::uuid, $2::uuid, '1', 'https://example.invalid/source', $3, now(),
       'test', '1', '1', '{}'::jsonb, $4::uuid, 'VALIDATED'
     )`,
    datasetVersionId,
    datasetId,
    `sha256:dataset:${datasetVersionId}`,
    rightsPolicyId,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "LexiconRelease" (
       "id", "lexiconId", "version", "status", "textProfileId",
       "vocabularyBundleId", "compressedArtifactHash", "contentHash",
       "canonicalizerVersion", "validatedAt"
     ) VALUES (
       $1::uuid, $2::uuid, 'restriction', 'VALIDATED', $3::uuid, $4::uuid,
       $5, $6, 'test/1', now()
     )`,
    releaseId,
    lexiconId,
    textProfileId,
    vocabularyBundleId,
    `sha256:compressed:${releaseId}`,
    `sha256:content:${releaseId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "LexiconReleaseSourceInput" (
       "id", "releaseId", "sourceDatasetVersionId", "sourceKey", "adapter", "checksum"
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'source', 'test', $4)`,
    randomUUID(),
    releaseId,
    datasetVersionId,
    `sha256:dataset:${datasetVersionId}`,
  );
  return {
    datasetId,
    datasetVersionId,
    lexiconId,
    releaseId,
    rightsPolicyId,
  };
}
