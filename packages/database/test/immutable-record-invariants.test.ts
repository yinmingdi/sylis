import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

const PUBLISHER_APPEND_ONLY_EXCLUSIONS = new Set([
  "AssessmentBlueprint",
  "AssessmentStimulus",
  "ContentProfile",
  "CorpusDataset",
  "Etymon",
  "ExerciseItem",
  "Headword",
  "InflectionRule",
  "LearningObjective",
  "LexicalConcept",
  "LexicalEntry",
  "LexicalSense",
  "Lexicon",
  "LexiconRelease",
  "LexiconStagingRecord",
  "Morph",
  "Morpheme",
  "PedagogicalMaterial",
  "ProficiencyFramework",
  "SourceDataset",
  "VocabularyBook",
  "WordFormationRule",
]);

describeDatabase("immutable record invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("installs the closed revision, event, decision, and terminal Job trigger set", async () => {
    const triggerNames = await database!.$queryRaw<
      Array<{ triggerName: string }>
    >`
      SELECT tgname AS "triggerName"
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname IN (
          'AgentMessage_append_only',
          'ReadingDocumentRevision_append_only',
          'ReadingActivity_append_only',
          'ReadingTarget_append_only',
          'CollectedLexicalItemRevision_append_only',
          'DiagnosticBundleRevision_append_only',
          'AgentPlanRevision_append_only',
          'AgentArtifactRevision_append_only',
          'AgentReleaseEvent_append_only',
          'ApprovalDecision_append_only',
          'CandidateRevision_append_only',
          'CredentialSecurityEvent_append_only',
          'DataAccessAuditEvent_append_only',
          'JobProgressEvent_append_only',
          'LexiconReleaseActivation_append_only',
          'ProviderRouteSecurityEvent_append_only',
          'ReviewDecision_append_only',
          'RightsDecision_append_only',
          'SecurityAuditEvent_append_only',
          'Job_terminal_fencing_guard'
        )
      ORDER BY tgname
    `;

    expect(triggerNames.map(({ triggerName }) => triggerName)).toEqual(
      [
        "AgentArtifactRevision_append_only",
        "AgentMessage_append_only",
        "AgentPlanRevision_append_only",
        "AgentReleaseEvent_append_only",
        "ApprovalDecision_append_only",
        "CandidateRevision_append_only",
        "CollectedLexicalItemRevision_append_only",
        "CredentialSecurityEvent_append_only",
        "DataAccessAuditEvent_append_only",
        "DiagnosticBundleRevision_append_only",
        "JobProgressEvent_append_only",
        "Job_terminal_fencing_guard",
        "LexiconReleaseActivation_append_only",
        "ProviderRouteSecurityEvent_append_only",
        "ReadingActivity_append_only",
        "ReadingDocumentRevision_append_only",
        "ReadingTarget_append_only",
        "ReviewDecision_append_only",
        "RightsDecision_append_only",
        "SecurityAuditEvent_append_only",
      ].sort(),
    );
  });

  it("installs append-only guards for every immutable Publisher table", async () => {
    const publisherInsertTables = await database!.$queryRaw<
      Array<{ tableName: string }>
    >`
      SELECT relation.relname AS "tableName"
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind = 'r'
        AND has_table_privilege(
          'sylis_lexicon_publisher',
          relation.oid,
          'INSERT'
        )
      ORDER BY relation.relname
    `;
    const expectedTables = publisherInsertTables
      .map(({ tableName }) => tableName)
      .filter((tableName) => !PUBLISHER_APPEND_ONLY_EXCLUSIONS.has(tableName));
    const guardedTables = await database!.$queryRaw<
      Array<{ tableName: string }>
    >`
      SELECT relation.relname AS "tableName"
      FROM pg_trigger AS trigger
      JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
      JOIN pg_proc AS guard_function ON guard_function.oid = trigger.tgfoid
      WHERE NOT trigger.tgisinternal
        AND guard_function.proname = 'sylis_reject_append_only_mutation'
      ORDER BY relation.relname
    `;
    const guarded = new Set(guardedTables.map(({ tableName }) => tableName));

    expect(expectedTables.length).toBeGreaterThan(150);
    expect(
      expectedTables.filter((tableName) => !guarded.has(tableName)),
    ).toEqual([]);
    expect(guarded.has("FSRSParameterSet")).toBe(true);
  });

  it("rejects updates and deletes of published lexicon and learning facts", async () => {
    const { headwordRevisionId } = await createHeadwordRevision();
    const bookEditionId = await createVocabularyBookEdition();
    const parameterSetId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "FSRSParameterSet" (
         "id", "version", "parameters", "contentHash", "effectiveAt"
       ) VALUES ($1::uuid, $2, '{}'::jsonb, $3, now())`,
      parameterSetId,
      `immutable-${parameterSetId}`,
      `sha256:fsrs:${parameterSetId}`,
    );

    for (const [tableName, id, assignment] of [
      ["HeadwordRevision", headwordRevisionId, `"displayText" = 'changed'`],
      ["VocabularyBookEdition", bookEditionId, `"version" = 'changed'`],
      ["FSRSParameterSet", parameterSetId, `"version" = 'changed'`],
    ] as const) {
      await expect(
        database!.$executeRawUnsafe(
          `UPDATE "${tableName}" SET ${assignment} WHERE "id" = $1::uuid`,
          id,
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        database!.$executeRawUnsafe(
          `DELETE FROM "${tableName}" WHERE "id" = $1::uuid`,
          id,
        ),
      ).rejects.toThrow(/append-only/);
    }
  });

  it("only deletes a user-owned revision for a due running purge", async () => {
    const userId = await createUser("due-user-purge");
    const artifactId = randomUUID();
    const revisionId = randomUUID();
    const bundleId = randomUUID();
    const draftId = randomUUID();
    const confirmationId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "AgentArtifact" ("id", "ownerUserId", "kind", "title")
       VALUES ($1::uuid, $2::uuid, 'OTHER', 'Immutable artifact')`,
      artifactId,
      userId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "AgentArtifactRevision" (
         "id", "artifactId", "revisionNo", "schemaVersion", "contentHash", "sourceRefs"
       ) VALUES ($1::uuid, $2::uuid, 1, 'test/1', $3, '[]'::jsonb)`,
      revisionId,
      artifactId,
      `sha256:${revisionId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "DiagnosticBundle" (
         "id", "ownerUserId", "redactionPolicyVersion"
       ) VALUES ($1::uuid, $2::uuid, 'test/1')`,
      bundleId,
      userId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "DiagnosticBundleRevision" (
         "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
         "contentHash", "status"
       ) VALUES ($1::uuid, $2::uuid, 1, '[]'::jsonb, '{}'::jsonb, $3, 'DRAFT')`,
      draftId,
      bundleId,
      `sha256:${draftId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "DiagnosticBundleRevision" (
         "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
         "contentHash", "status", "confirmedFromRevisionId", "confirmedAt"
       ) VALUES (
         $1::uuid, $2::uuid, 2, '[]'::jsonb, '{}'::jsonb, $3,
         'CONFIRMED', $4::uuid, now()
       )`,
      confirmationId,
      bundleId,
      `sha256:${draftId}`,
      draftId,
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "AgentArtifactRevision" SET "sourceRefs" = '[{"changed":true}]'::jsonb
         WHERE "id" = $1::uuid`,
        revisionId,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      database!.$executeRawUnsafe(
        `DELETE FROM "AgentArtifactRevision" WHERE "id" = $1::uuid`,
        revisionId,
      ),
    ).rejects.toThrow(/append-only/);

    const requestId = randomUUID();
    await database!.$executeRawUnsafe(
      `UPDATE "User" SET "status" = 'DELETED', "deletedAt" = now()
       WHERE "id" = $1::uuid`,
      userId,
    );
    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ContentDeletionRequest" (
           "id", "targetKind", "requestedByUserId", "hiddenAt", "purgeAfter", "status"
         ) VALUES (
           $1::uuid, 'USER', $2::uuid,
           now() - interval '2 minutes', now() - interval '1 minute', 'RUNNING'
         )`,
        requestId,
        userId,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ContentDeletionUserTarget" ("requestId", "userId")
         VALUES ($1::uuid, $2::uuid)`,
        requestId,
        userId,
      );
    });

    await expect(
      database!.$executeRawUnsafe(
        `DELETE FROM "AgentArtifactRevision" WHERE "id" = $1::uuid`,
        revisionId,
      ),
    ).resolves.toBe(1);
    await expect(
      database!.$executeRawUnsafe(
        `DELETE FROM "DiagnosticBundleRevision" WHERE "id" = $1::uuid`,
        draftId,
      ),
    ).resolves.toBe(1);
    await expect(
      database!.diagnosticBundleRevision.count({
        where: { id: confirmationId },
      }),
    ).resolves.toBe(0);
  });

  it("requires a due running deletion request for session-owned facts", async () => {
    const userId = await createUser("due-session-purge");
    const sessionId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "AgentSession" (
         "id", "userId", "title", "status", "archivedAt", "deletedAt"
       ) VALUES ($1::uuid, $2::uuid, 'Deleted session', 'DELETED', now(), now())`,
      sessionId,
      userId,
    );

    await expect(dueSessionDelete(sessionId)).resolves.toBe(false);

    const requestId = randomUUID();
    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ContentDeletionRequest" (
           "id", "targetKind", "requestedByUserId", "hiddenAt", "purgeAfter", "status"
         ) VALUES (
           $1::uuid, 'SESSION', $2::uuid,
           now() - interval '2 minutes', now() - interval '1 minute', 'RUNNING'
         )`,
        requestId,
        userId,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ContentDeletionSessionTarget" ("requestId", "sessionId")
         VALUES ($1::uuid, $2::uuid)`,
        requestId,
        sessionId,
      );
    });

    await expect(dueSessionDelete(sessionId)).resolves.toBe(true);
  });

  it("stores confirmation as a new immutable DiagnosticBundle revision", async () => {
    const userId = await createUser("diagnostic-confirmation");
    const bundleId = randomUUID();
    const draftId = randomUUID();
    const confirmedId = randomUUID();
    const contentHash = `sha256:${randomUUID()}`;
    await database!.$executeRawUnsafe(
      `INSERT INTO "DiagnosticBundle" (
         "id", "ownerUserId", "redactionPolicyVersion"
       ) VALUES ($1::uuid, $2::uuid, 'test/1')`,
      bundleId,
      userId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "DiagnosticBundleRevision" (
         "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
         "contentHash", "status"
       ) VALUES ($1::uuid, $2::uuid, 1, '[]'::jsonb, '{}'::jsonb, $3, 'DRAFT')`,
      draftId,
      bundleId,
      contentHash,
    );
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "DiagnosticBundleRevision" (
           "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
           "contentHash", "status", "confirmedFromRevisionId", "confirmedAt"
         ) VALUES (
           $1::uuid, $2::uuid, 2, '[]'::jsonb, '{}'::jsonb, $3,
           'CONFIRMED', $4::uuid, now()
         )`,
        confirmedId,
        bundleId,
        contentHash,
        draftId,
      ),
    ).resolves.toBe(1);
    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "DiagnosticBundleRevision"
         SET "status" = 'CONFIRMED', "confirmedAt" = now()
         WHERE "id" = $1::uuid`,
        draftId,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "DiagnosticBundleRevision" (
           "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
           "contentHash", "status"
         ) VALUES (
           $1::uuid, $2::uuid, 3, '[]'::jsonb, '{}'::jsonb, $3, 'CONFIRMED'
         )`,
        randomUUID(),
        bundleId,
        `sha256:${randomUUID()}`,
      ),
    ).rejects.toThrow(/DiagnosticBundleRevision_confirmation_shape_check/);
  });

  it("freezes Agent release content and enforces its one-way lifecycle", async () => {
    const releaseId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "CapabilityRelease" (
         "id", "capabilityKey", "version", "executionMode", "systemPrompt",
         "promptHash", "toolPolicyVersion", "inputSchemaVersion",
         "outputSchemaVersion", "status", "releaseDigest"
       ) VALUES (
         $1::uuid, $2, '1.0.0', 'SINGLE_CALL', 'system', $3, 'tools/1',
         'input/1', 'output/1', 'DRAFT', $4
       )`,
      releaseId,
      `test.capability.${releaseId}`,
      `sha256:prompt:${releaseId}`,
      `sha256:release:${releaseId}`,
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "CapabilityRelease" SET "systemPrompt" = 'changed'
         WHERE "id" = $1::uuid`,
        releaseId,
      ),
    ).rejects.toThrow(/release content is immutable/);
    await expect(updateReleaseStatus(releaseId, "CANDIDATE")).resolves.toBe(1);
    await expect(updateReleaseStatus(releaseId, "PUBLISHED")).resolves.toBe(1);
    await expect(updateReleaseStatus(releaseId, "DRAFT")).rejects.toThrow(
      /AGENT_RELEASE_TRANSITION_INVALID/,
    );
    await expect(updateReleaseStatus(releaseId, "REVOKED")).resolves.toBe(1);
    await expect(updateReleaseStatus(releaseId, "PUBLISHED")).rejects.toThrow(
      /AGENT_RELEASE_TRANSITION_INVALID/,
    );
    await expect(
      database!.$executeRawUnsafe(
        `DELETE FROM "CapabilityRelease" WHERE "id" = $1::uuid`,
        releaseId,
      ),
    ).rejects.toThrow(/release cannot be deleted/);
  });

  it("installs the immutable release guard on all four Agent release tables", async () => {
    const triggerNames = await database!.$queryRaw<
      Array<{ triggerName: string }>
    >`
      SELECT tgname AS "triggerName"
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname IN (
          'CapabilityRelease_immutable_release_guard',
          'ToolRelease_immutable_release_guard',
          'SkillRelease_immutable_release_guard',
          'EvalRelease_immutable_release_guard'
        )
      ORDER BY tgname
    `;
    expect(triggerNames).toHaveLength(4);
  });

  it("freezes Provider route content and only permits revoke and restore", async () => {
    const routeId = await createProviderRoute("PUBLISHED");
    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "ProviderRouteRelease" SET "modelId" = 'changed'
         WHERE "id" = $1::uuid`,
        routeId,
      ),
    ).rejects.toThrow(/PROVIDER_ROUTE_RELEASE_CONTENT_IMMUTABLE/);
    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "ProviderRouteRelease"
         SET "status" = 'REVOKED', "revokedAt" = now()
         WHERE "id" = $1::uuid`,
        routeId,
      ),
    ).resolves.toBe(1);
    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "ProviderRouteRelease" SET "revokedAt" = now() + interval '1 minute'
         WHERE "id" = $1::uuid`,
        routeId,
      ),
    ).rejects.toThrow(/PROVIDER_ROUTE_RELEASE_TRANSITION_INVALID/);
    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "ProviderRouteRelease"
         SET "status" = 'PUBLISHED', "revokedAt" = NULL
         WHERE "id" = $1::uuid`,
        routeId,
      ),
    ).resolves.toBe(1);

    const draftRouteId = await createProviderRoute("DRAFT");
    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "ProviderRouteRelease" SET "status" = 'PUBLISHED'
         WHERE "id" = $1::uuid`,
        draftRouteId,
      ),
    ).rejects.toThrow(/PROVIDER_ROUTE_RELEASE_TRANSITION_INVALID/);
    await expect(
      database!.$executeRawUnsafe(
        `DELETE FROM "ProviderRouteRelease" WHERE "id" = $1::uuid`,
        routeId,
      ),
    ).rejects.toThrow(/PROVIDER_ROUTE_RELEASE_DELETE_FORBIDDEN/);
  });
});

async function createUser(label: string): Promise<string> {
  const id = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "displayName") VALUES ($1::uuid, $2)`,
    id,
    `Immutable invariant ${label}`,
  );
  return id;
}

async function createHeadwordRevision(): Promise<{
  headwordRevisionId: string;
}> {
  const lexiconId = randomUUID();
  const releaseId = randomUUID();
  const textProfileId = randomUUID();
  const vocabularyBundleId = randomUUID();
  const headwordId = randomUUID();
  const headwordRevisionId = randomUUID();
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
    `immutable-${vocabularyBundleId}`,
    `sha256:vocabulary:${vocabularyBundleId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "Lexicon" ("id", "key", "sourceLanguageTag", "updatedAt")
     VALUES ($1::uuid, $2, 'en', now())`,
    lexiconId,
    `immutable-${lexiconId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "LexiconRelease" (
       "id", "lexiconId", "version", "textProfileId", "vocabularyBundleId",
       "compressedArtifactHash", "contentHash", "canonicalizerVersion"
     ) VALUES (
       $1::uuid, $2::uuid, 'immutable', $3::uuid, $4::uuid, $5, $6, 'test/1'
     )`,
    releaseId,
    lexiconId,
    textProfileId,
    vocabularyBundleId,
    `sha256:compressed:${releaseId}`,
    `sha256:content:${releaseId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "Headword" ("id", "lexiconId", "identityKey")
     VALUES ($1::uuid, $2::uuid, $3)`,
    headwordId,
    lexiconId,
    `immutable-${headwordId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "HeadwordRevision" (
       "id", "releaseId", "headwordId", "displayText", "normalizedText",
       "searchKey", "sortKey"
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'word', 'word', 'word', 'word')`,
    headwordRevisionId,
    releaseId,
    headwordId,
  );
  return { headwordRevisionId };
}

async function createVocabularyBookEdition(): Promise<string> {
  const rightsPolicyId = randomUUID();
  const datasetId = randomUUID();
  const datasetVersionId = randomUUID();
  const bookId = randomUUID();
  const editionId = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "SourceRightsPolicy" (
       "id", "key", "version", "mayBuild", "mayServe", "mayExport",
       "requiresAttribution", "effectiveFrom"
     ) VALUES ($1::uuid, $2, '1', true, true, true, false, now())`,
    rightsPolicyId,
    `immutable-${rightsPolicyId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "SourceDataset" ("id", "key", "name", "homepageUri")
     VALUES ($1::uuid, $2, 'Immutable source', 'https://example.invalid')`,
    datasetId,
    `immutable-${datasetId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "SourceDatasetVersion" (
       "id", "datasetId", "version", "sourceUri", "checksum", "retrievedAt",
       "adapter", "parserVersion", "schemaVersion", "validationSummary",
       "rightsPolicyId"
     ) VALUES (
       $1::uuid, $2::uuid, '1', 'https://example.invalid/source', $3, now(),
       'test', '1', '1', '{}'::jsonb, $4::uuid
     )`,
    datasetVersionId,
    datasetId,
    `sha256:dataset:${datasetVersionId}`,
    rightsPolicyId,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "VocabularyBook" (
       "id", "key", "title", "languageTag", "publisherKey"
     ) VALUES ($1::uuid, $2, 'Immutable book', 'en', 'test')`,
    bookId,
    `immutable-${bookId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "VocabularyBookEdition" (
       "id", "bookId", "editionKey", "version", "sourceDatasetVersionId",
       "contentHash", "publishedAt"
     ) VALUES ($1::uuid, $2::uuid, 'first', '1', $3::uuid, $4, now())`,
    editionId,
    bookId,
    datasetVersionId,
    `sha256:book:${editionId}`,
  );
  return editionId;
}

async function dueSessionDelete(sessionId: string): Promise<boolean> {
  const [row] = await database!.$queryRawUnsafe<Array<{ due: boolean }>>(
    `SELECT "sylis_due_content_delete"(
       'AgentMessage', jsonb_build_object('sessionId', $1::text)
     ) AS due`,
    sessionId,
  );
  return row?.due ?? false;
}

function updateReleaseStatus(releaseId: string, status: string) {
  return database!.$executeRawUnsafe(
    `UPDATE "CapabilityRelease" SET "status" = $2::"ImmutableReleaseStatus"
     WHERE "id" = $1::uuid`,
    releaseId,
    status,
  );
}

async function createProviderRoute(status: "DRAFT" | "PUBLISHED") {
  const id = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "ProviderRouteRelease" (
       "id", "providerKey", "modelId", "endpointClass", "capabilities",
       "adapterVersion", "pricingVersion", "pricing", "policyVersion",
       "releaseDigest", "status"
     ) VALUES (
       $1::uuid, $2, $3, 'CHAT_COMPLETIONS', ARRAY['TEXT_GENERATION']::"ModelCapabilityKind"[],
       'adapter/1', 'pricing/1', '{}'::jsonb, 'policy/1', $4, $5::"ImmutableReleaseStatus"
     )`,
    id,
    `test-provider-${id}`,
    `test-model-${id}`,
    `sha256:route:${id}`,
    status,
  );
  return id;
}
