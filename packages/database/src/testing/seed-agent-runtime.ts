import * as prismaClientPackage from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import {
  AgentExecutionMode as ContractAgentExecutionMode,
  ToolSideEffectClass,
} from "@sylis/agent-contracts";
import {
  AGENT_CAPABILITY_RELEASE_FIXTURES,
  AGENT_EVAL_RELEASE_FIXTURE,
  AGENT_RUNTIME_FIXTURE_IDS,
  AGENT_SKILL_RELEASE_FIXTURE,
  AGENT_TOOL_RELEASE_FIXTURES,
  AgentFixtureProviderKey,
  AgentReleaseDigestKind,
  agentContentDigest,
} from "@sylis/agent-contracts/release-fixtures";
import { createContentCrypto } from "@sylis/content-crypto";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

import type { SylisDatabase } from "../client/prisma-client";

const {
  AgentExecutionMode,
  AgentReleaseEnvironment,
  AgentReleaseEventKind,
  AgentReleaseKind,
  AgentToolSideEffectClass,
  CredentialOwnerKind,
  CredentialStatus,
  CredentialType,
  DocumentOriginKind,
  DocumentRetentionPolicy,
  DocumentRightsPolicy,
  ImmutableReleaseStatus,
  ModelCapabilityKind,
  ModelEndpointClass,
  ReadingDocumentStatus,
  ReadingDocumentVisibility,
} = prismaClientPackage;

const FIXTURE_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");
const READING_FIXTURE_CONTENT =
  "A bank can hold money, while a river bank is the land beside flowing water.";

const READING_FIXTURE_ORIGIN_ID = "00000000-0000-4000-8000-000000000980";

export interface SeedAgentRuntimeFixturesInput {
  database: SylisDatabase;
  credentialKek: Uint8Array;
  credentialKekVersion: string;
  credentialFingerprintKey: Uint8Array;
  contentEncryptionKey: Uint8Array;
  contentEncryptionKeyVersion: string;
}

export interface SeedAgentRuntimeFixturesResult {
  routeReleaseId: string;
  credentialProfileId: string;
  credentialRevisionId: string;
  capabilityReleaseIds: readonly string[];
  toolReleaseIds: readonly string[];
  skillReleaseId: string;
  evalReleaseId: string;
  readingDocumentId: string;
  readingDocumentRevisionId: string;
}

export async function seedAgentRuntimeFixtures(
  input: SeedAgentRuntimeFixturesInput,
): Promise<SeedAgentRuntimeFixturesResult> {
  assertKey(input.credentialKek, "credentialKek");
  assertKey(input.credentialFingerprintKey, "credentialFingerprintKey");
  assertKey(input.contentEncryptionKey, "contentEncryptionKey");
  const route = routeFixture();
  const createdRoute = await input.database.providerRouteRelease.upsert({
    where: { id: route.id },
    create: route,
    update: {},
  });
  assertFixtureDigest(createdRoute.releaseDigest, route.releaseDigest, "route");

  await seedCredential(input);
  await seedReadingDocument(input);

  for (const tool of AGENT_TOOL_RELEASE_FIXTURES) {
    const created = await input.database.toolRelease.upsert({
      where: { id: tool.id },
      create: {
        id: tool.id,
        toolKey: tool.toolKey,
        version: tool.version,
        implementationDigest: tool.implementationDigest,
        schemaDigest: tool.schemaDigest,
        owner: tool.owner,
        sideEffectClass: databaseSideEffectClass(tool.sideEffectClass),
        requiredScopes: [...tool.requiredScopes],
        inputSchema: tool.inputSchema as PrismaTypes.InputJsonValue,
        outputSchema: tool.outputSchema as PrismaTypes.InputJsonValue,
        timeoutMs: tool.timeoutMs,
        maxCalls: tool.maxCalls,
        idempotencyPolicy: tool.idempotencyPolicy as PrismaTypes.InputJsonValue,
        redactionPolicy: tool.redactionPolicy as PrismaTypes.InputJsonValue,
        releaseDigest: tool.releaseDigest,
        status: ImmutableReleaseStatus.PUBLISHED,
        releaseEvidence: fixtureEvidence(AgentReleaseDigestKind.TOOL),
      },
      update: {},
    });
    assertFixtureDigest(
      created.releaseDigest,
      tool.releaseDigest,
      tool.toolKey,
    );
  }

  const skill = AGENT_SKILL_RELEASE_FIXTURE;
  const createdSkill = await input.database.skillRelease.upsert({
    where: { id: skill.id },
    create: {
      id: skill.id,
      skillKey: skill.skillKey,
      version: skill.version,
      markdown: skill.markdown,
      markdownDigest: skill.markdownDigest,
      releaseDigest: skill.releaseDigest,
      status: ImmutableReleaseStatus.PUBLISHED,
      releaseEvidence: fixtureEvidence(AgentReleaseDigestKind.SKILL),
    },
    update: {},
  });
  assertFixtureDigest(
    createdSkill.releaseDigest,
    skill.releaseDigest,
    skill.skillKey,
  );

  const evaluation = AGENT_EVAL_RELEASE_FIXTURE;
  const createdEval = await input.database.evalRelease.upsert({
    where: { id: evaluation.id },
    create: {
      id: evaluation.id,
      evalKey: evaluation.evalKey,
      version: evaluation.version,
      suiteRef: evaluation.suiteRef,
      suiteDigest: evaluation.suiteDigest,
      releaseDigest: evaluation.releaseDigest,
      status: ImmutableReleaseStatus.PUBLISHED,
      releaseEvidence: {
        ...fixtureEvidence(AgentReleaseDigestKind.EVAL),
        suiteRef: evaluation.suiteRef,
        suiteDigest: evaluation.suiteDigest,
      },
    },
    update: {},
  });
  assertFixtureDigest(
    createdEval.releaseDigest,
    evaluation.releaseDigest,
    evaluation.evalKey,
  );

  for (const capability of AGENT_CAPABILITY_RELEASE_FIXTURES) {
    const created = await input.database.capabilityRelease.upsert({
      where: { id: capability.id },
      create: {
        id: capability.id,
        capabilityKey: capability.capabilityKey,
        version: capability.version,
        executionMode: databaseExecutionMode(capability.executionMode),
        systemPrompt: capability.systemPrompt,
        promptHash: capability.promptHash,
        toolPolicyVersion: capability.toolPolicyVersion,
        inputSchemaVersion: capability.inputSchemaVersion,
        outputSchemaVersion: capability.outputSchemaVersion,
        contextTokenBudget: capability.contextTokenBudget,
        maxChildRuns: capability.maxChildRuns,
        maxSteps: capability.maxSteps,
        maxToolCalls: capability.maxToolCalls,
        maxOutputTokens: capability.maxOutputTokens,
        status: ImmutableReleaseStatus.PUBLISHED,
        releaseEvidence: fixtureEvidence(AgentReleaseDigestKind.CAPABILITY),
        releaseDigest: capability.releaseDigest,
      },
      update: {},
    });
    assertFixtureDigest(
      created.releaseDigest,
      capability.releaseDigest,
      capability.capabilityKey,
    );
    await input.database.capabilityRouteAllowance.upsert({
      where: {
        capabilityReleaseId_routeReleaseId: {
          capabilityReleaseId: capability.id,
          routeReleaseId: route.id,
        },
      },
      create: {
        capabilityReleaseId: capability.id,
        routeReleaseId: route.id,
      },
      update: {},
    });
    for (const toolReleaseId of capability.toolReleaseIds) {
      await input.database.capabilityToolRelease.upsert({
        where: {
          capabilityReleaseId_toolReleaseId: {
            capabilityReleaseId: capability.id,
            toolReleaseId,
          },
        },
        create: { capabilityReleaseId: capability.id, toolReleaseId },
        update: {},
      });
    }
    await input.database.capabilitySkillRelease.upsert({
      where: {
        capabilityReleaseId_skillReleaseId: {
          capabilityReleaseId: capability.id,
          skillReleaseId: skill.id,
        },
      },
      create: {
        capabilityReleaseId: capability.id,
        skillReleaseId: skill.id,
      },
      update: {},
    });
    await input.database.capabilityEvalRequirement.upsert({
      where: {
        capabilityReleaseId_evalReleaseId: {
          capabilityReleaseId: capability.id,
          evalReleaseId: evaluation.id,
        },
      },
      create: {
        capabilityReleaseId: capability.id,
        evalReleaseId: evaluation.id,
        minimumScore: capability.evalRequirements[0]!.minimumScore,
      },
      update: {},
    });
  }

  const deployedReleases = [
    ...AGENT_TOOL_RELEASE_FIXTURES.map((release) => ({
      kind: AgentReleaseKind.TOOL,
      key: release.toolKey,
      id: release.id,
    })),
    {
      kind: AgentReleaseKind.SKILL,
      key: skill.skillKey,
      id: skill.id,
    },
    {
      kind: AgentReleaseKind.EVAL,
      key: evaluation.evalKey,
      id: evaluation.id,
    },
    ...AGENT_CAPABILITY_RELEASE_FIXTURES.map((release) => ({
      kind: AgentReleaseKind.CAPABILITY,
      key: release.capabilityKey,
      id: release.id,
    })),
  ];
  for (const release of deployedReleases) {
    const validationDigest = agentContentDigest({
      action: "fixture.validate",
      releaseKind: release.kind,
      releaseKey: release.key,
      releaseId: release.id,
    });
    await input.database.agentReleaseEvent.upsert({
      where: { actionDigest: validationDigest },
      create: {
        releaseKind: release.kind,
        releaseId: release.id,
        kind: AgentReleaseEventKind.VALIDATED,
        actorRef: "fixture-seed",
        reason: "deterministic fixture validation",
        policyVersion: "agent-release/v1",
        actionDigest: validationDigest,
      },
      update: {},
    });
    for (const environment of Object.values(AgentReleaseEnvironment)) {
      const actionDigest = agentContentDigest({
        action: "fixture.deploy",
        releaseKind: release.kind,
        releaseKey: release.key,
        releaseId: release.id,
        environment,
      });
      await input.database.agentReleaseDeployment.upsert({
        where: {
          releaseKind_releaseKey_environment: {
            releaseKind: release.kind,
            releaseKey: release.key,
            environment,
          },
        },
        create: {
          releaseKind: release.kind,
          releaseKey: release.key,
          environment,
          activeReleaseId: release.id,
          actionDigest,
          updatedBy: "fixture-seed",
        },
        update: {},
      });
    }
  }

  return {
    routeReleaseId: route.id,
    credentialProfileId: AGENT_RUNTIME_FIXTURE_IDS.credentialProfile,
    credentialRevisionId: AGENT_RUNTIME_FIXTURE_IDS.credentialRevision,
    capabilityReleaseIds: AGENT_CAPABILITY_RELEASE_FIXTURES.map(({ id }) => id),
    toolReleaseIds: AGENT_TOOL_RELEASE_FIXTURES.map(({ id }) => id),
    skillReleaseId: skill.id,
    evalReleaseId: evaluation.id,
    readingDocumentId: AGENT_RUNTIME_FIXTURE_IDS.readingDocument,
    readingDocumentRevisionId:
      AGENT_RUNTIME_FIXTURE_IDS.readingDocumentRevision,
  };
}

async function seedReadingDocument(
  input: SeedAgentRuntimeFixturesInput,
): Promise<void> {
  const documentId = AGENT_RUNTIME_FIXTURE_IDS.readingDocument;
  const revisionId = AGENT_RUNTIME_FIXTURE_IDS.readingDocumentRevision;
  const contentHash = prefixedSha256(READING_FIXTURE_CONTENT);
  const contentCiphertext = encryptField(
    READING_FIXTURE_CONTENT,
    `reading-revision:${revisionId}`,
    input.contentEncryptionKey,
  );
  await input.database.$transaction(async (transaction) => {
    await transaction.documentOrigin.upsert({
      where: { id: READING_FIXTURE_ORIGIN_ID },
      create: {
        id: READING_FIXTURE_ORIGIN_ID,
        kind: DocumentOriginKind.REDDIT,
        sourceKey: "reddit.com",
        rightsPolicy: DocumentRightsPolicy.SOURCE_TERMS,
        rightsReferenceUrl: "https://www.redditinc.com/policies/user-agreement",
        retentionPolicy: DocumentRetentionPolicy.SOURCE_CONTROLLED,
        attributionRequired: true,
        attributionText: "Reddit",
        attributionUrl: "https://www.reddit.com/",
        createdAt: FIXTURE_TIMESTAMP,
      },
      update: {},
    });
    await transaction.readingDocument.upsert({
      where: { id: documentId },
      create: {
        id: documentId,
        originId: READING_FIXTURE_ORIGIN_ID,
        externalKey: "agent-tool-reading-fixture",
        status: ReadingDocumentStatus.DRAFT,
        visibility: ReadingDocumentVisibility.PUBLIC,
        createdAt: FIXTURE_TIMESTAMP,
      },
      update: {},
    });
    await transaction.readingDocumentRevision.upsert({
      where: { id: revisionId },
      create: {
        id: revisionId,
        documentId,
        revisionNo: 1,
        languageTag: "en",
        title: "Bank vocabulary evidence",
        contentCiphertext,
        keyVersion: input.contentEncryptionKeyVersion,
        contentHash,
        wordCount: 15,
        createdAt: FIXTURE_TIMESTAMP,
        publishedAt: FIXTURE_TIMESTAMP,
      },
      update: {},
    });
    await transaction.readingDocument.update({
      where: { id: documentId },
      data: {
        currentRevisionId: revisionId,
        status: ReadingDocumentStatus.PUBLISHED,
      },
    });
    await transaction.redditDocumentMetadata.upsert({
      where: { documentId },
      create: {
        documentId,
        subreddit: "EnglishLearning",
        postId: "e2e-bank-vocabulary-evidence",
        authorHash: "e2e-author",
        sourceUrl:
          "https://www.reddit.com/r/EnglishLearning/comments/e2e/bank_vocabulary_evidence/",
        sourceCreatedAt: FIXTURE_TIMESTAMP,
      },
      update: {},
    });
  });
}

async function seedCredential(
  input: SeedAgentRuntimeFixturesInput,
): Promise<void> {
  const profileId = AGENT_RUNTIME_FIXTURE_IDS.credentialProfile;
  const revisionId = AGENT_RUNTIME_FIXTURE_IDS.credentialRevision;
  const current = await input.database.credentialRevision.findUnique({
    where: { id: revisionId },
  });
  if (current) {
    if (
      current.profileId !== profileId ||
      current.status !== CredentialStatus.VERIFIED
    ) {
      throw new Error("AGENT_FIXTURE_CREDENTIAL_CONFLICT");
    }
    return;
  }
  const secret = "fake-provider-key";
  const schemaVersion = "credential-envelope/1";
  const crypto = createContentCrypto({
    currentVersion: () => input.credentialKekVersion,
    key: (version) => {
      if (version !== input.credentialKekVersion) {
        throw new Error("AGENT_FIXTURE_KEK_VERSION");
      }
      return input.credentialKek;
    },
  });
  const envelope = await crypto.encrypt(Buffer.from(secret), {
    ownerKind: "credential-profile",
    ownerId: profileId,
    purpose: AgentFixtureProviderKey.FAKE,
    recordId: revisionId,
    schemaVersion,
  });
  await input.database.$transaction(async (transaction) => {
    await transaction.credentialProfile.upsert({
      where: { id: profileId },
      create: {
        id: profileId,
        ownerKind: CredentialOwnerKind.PLATFORM,
        providerKey: AgentFixtureProviderKey.FAKE,
        label: "Deterministic fake Provider",
        status: CredentialStatus.VERIFIED,
      },
      update: {},
    });
    await transaction.credentialRevision.create({
      data: {
        id: revisionId,
        profileId,
        revisionNo: 1,
        credentialType: CredentialType.API_KEY,
        status: CredentialStatus.VERIFIED,
        ciphertext: Buffer.from(envelope.ciphertext, "base64"),
        nonce: Buffer.from(envelope.nonce, "base64"),
        authTag: Buffer.from(envelope.authTag, "base64"),
        encryptedDek: Buffer.from(envelope.encryptedDek, "base64"),
        dekNonce: Buffer.from(envelope.dekNonce, "base64"),
        dekAuthTag: Buffer.from(envelope.dekAuthTag, "base64"),
        kekVersion: envelope.kekVersion,
        aadSchemaVersion: envelope.aadSchemaVersion,
        fingerprint: crypto.fingerprint(secret, input.credentialFingerprintKey),
        fingerprintVersion: "hmac-sha256/1",
        maskedHint: "****-key",
        metadata: { fixture: true },
        validatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await transaction.credentialProfile.update({
      where: { id: profileId },
      data: { currentRevisionId: revisionId },
    });
  });
}

function routeFixture() {
  const base = {
    providerKey: AgentFixtureProviderKey.FAKE,
    modelId: "fixture",
    endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
    capabilities: [
      ModelCapabilityKind.TEXT_GENERATION,
      ModelCapabilityKind.STRUCTURED_GENERATION,
    ],
    adapterVersion: "fake/1",
    pricingVersion: "fixture/1",
    pricing: {
      currency: "USD",
      inputUsdPerMillion: "0",
      outputUsdPerMillion: "0",
      cacheHitUsdPerMillion: "0",
    },
    policyVersion: "fixture/1",
  };
  return {
    id: AGENT_RUNTIME_FIXTURE_IDS.routeRelease,
    ...base,
    releaseDigest: agentContentDigest({
      releaseKind: "PROVIDER_ROUTE",
      ...base,
    }),
    status: ImmutableReleaseStatus.PUBLISHED,
  };
}

function fixtureEvidence(kind: AgentReleaseDigestKind) {
  return { source: "git", fixture: true, kind, checks: ["deterministic"] };
}

function databaseExecutionMode(value: string) {
  switch (value) {
    case ContractAgentExecutionMode.SINGLE_CALL:
      return AgentExecutionMode.SINGLE_CALL;
    case ContractAgentExecutionMode.WORKFLOW:
      return AgentExecutionMode.WORKFLOW;
    case ContractAgentExecutionMode.AGENT_LOOP:
      return AgentExecutionMode.AGENT_LOOP;
    default:
      throw new Error("AGENT_FIXTURE_EXECUTION_MODE");
  }
}

function databaseSideEffectClass(value: string) {
  switch (value) {
    case ToolSideEffectClass.READ_PUBLIC:
      return AgentToolSideEffectClass.READ_PUBLIC;
    case ToolSideEffectClass.READ_PRIVATE:
      return AgentToolSideEffectClass.READ_PRIVATE;
    case ToolSideEffectClass.WRITE_PRIVATE_REVERSIBLE:
      return AgentToolSideEffectClass.WRITE_PRIVATE_REVERSIBLE;
    case ToolSideEffectClass.WRITE_FORMAL:
      return AgentToolSideEffectClass.WRITE_FORMAL;
    case ToolSideEffectClass.EXTERNAL_SIDE_EFFECT:
      return AgentToolSideEffectClass.EXTERNAL_SIDE_EFFECT;
    default:
      throw new Error("AGENT_FIXTURE_SIDE_EFFECT_CLASS");
  }
}

function assertFixtureDigest(
  actual: string,
  expected: string,
  key: string,
): void {
  if (actual !== expected) throw new Error(`AGENT_FIXTURE_CONFLICT:${key}`);
}

function assertKey(value: Uint8Array, field: string): void {
  if (value.byteLength !== 32)
    throw new Error(`AGENT_FIXTURE_${field.toUpperCase()}`);
}

function encryptField(
  value: string,
  purpose: string,
  key: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Uint8Array.from(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
}

function prefixedSha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
