import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const invariants = readFileSync(
  resolve(__dirname, "../prisma/invariants.sql"),
  "utf8",
);
const modelExecutionSchema = readFileSync(
  resolve(__dirname, "../prisma/schema/model-execution.prisma"),
  "utf8",
);
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describe("model content invariant DDL", () => {
  it("installs encrypted-body, normalized-part, consent, and withdrawal guards", () => {
    expect(invariants).toContain(
      "ModelContentBody_envelope_and_lifecycle_check",
    );
    expect(invariants).toContain(
      'CREATE TRIGGER "ModelContentBody_update_guard"',
    );
    expect(invariants).toContain("ModelExchangePart_normalized_shape_check");
    expect(invariants).toContain(
      'CREATE CONSTRAINT TRIGGER "ModelExchangePart_consent_guard"',
    );
    expect(invariants).toContain(
      'CREATE CONSTRAINT TRIGGER "ConsentRecord_optional_exchange_withdrawal_guard"',
    );
    expect(invariants).toContain(
      'CREATE TRIGGER "ModelContentFragment_append_guard"',
    );
    expect(invariants).toContain(
      "ModelContentFragment sequence must be contiguous",
    );
    expect(invariants).toContain(
      "sealed ModelContentBody cannot accept fragments",
    );
    expect(invariants).toContain(
      'CREATE TRIGGER "ModelContentFragment_append_only"',
    );
    expect(modelExecutionSchema).not.toMatch(
      /model ModelExchangePart \{[\s\S]*?\n\s+metadata\s+Json/,
    );
  });
});

describeDatabase("model content invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("enforces body ownership, envelope shape, immutable binding, and cryptoshred", async () => {
    const userId = await createUser();
    const bodyId = await createBody(userId);

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ModelContentBody" (
           "id", "ownerKind", "purpose", "ciphertext", "nonce", "authTag",
           "encryptedDek", "dekNonce", "dekAuthTag", "kekVersion",
           "aadSchemaVersion", "contentHash", "requestKey", "visibility",
           "retentionClass"
         ) VALUES (
           $1::uuid, 'AGENT_MESSAGE', 'AGENT_RUN', decode('01', 'hex'),
           decode(repeat('01', 12), 'hex'), decode(repeat('01', 16), 'hex'),
           decode('01', 'hex'), decode(repeat('01', 12), 'hex'),
           decode(repeat('01', 16), 'hex'), 'test-kek/1',
           'model-content-body/1', $2, $3, 'USER', 'USER_CONTROLLED'
         )`,
        randomUUID(),
        digest("owner-xor"),
        `model-content:${randomUUID()}`,
      ),
    ).rejects.toThrow(/ModelContentBody_owner_xor_check|check constraint/);

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "ModelContentBody" SET "visibility" = 'INTERNAL'
         WHERE "id" = $1::uuid`,
        bodyId,
      ),
    ).rejects.toThrow(/MODEL_CONTENT_BODY_BINDING_IMMUTABLE/);

    await database!.$executeRawUnsafe(
      `UPDATE "ModelContentBody"
       SET "hiddenAt" = now(), "purgeAfter" = now()
       WHERE "id" = $1::uuid`,
      bodyId,
    );
    await database!.$executeRawUnsafe(
      `UPDATE "ModelContentBody"
       SET "ciphertext" = decode(repeat('02', 32), 'hex'),
           "nonce" = decode(repeat('02', 12), 'hex'),
           "authTag" = decode(repeat('02', 16), 'hex'),
           "encryptedDek" = decode(repeat('02', 32), 'hex'),
           "dekNonce" = decode(repeat('02', 12), 'hex'),
           "dekAuthTag" = decode(repeat('02', 16), 'hex'),
           "kekVersion" = 'purged', "contentHash" = $2, "purgedAt" = now()
       WHERE "id" = $1::uuid`,
      bodyId,
      digest(`purged:${bodyId}`),
    );
  });

  it("requires latest owner consent and forbids SYSTEM/raw exchange parts", async () => {
    const fixture = await createExchangeFixture();
    await insertTextPart(fixture);

    await expect(
      insertTextPart({ ...fixture, partId: randomUUID(), role: "SYSTEM" }),
    ).rejects.toThrow(
      /ModelExchangePart_normalized_shape_check|check constraint/,
    );

    const otherUserId = await createUser();
    const otherConsentId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "ConsentRecord" (
         "id", "userId", "purpose", "categories", "policyVersion", "decision"
       ) VALUES (
         $1::uuid, $2::uuid, 'OPTIONAL_MODEL_EXCHANGE',
         ARRAY['MODEL_OUTPUT']::"ConsentDataCategory"[], 'test/1', 'GRANTED'
       )`,
      otherConsentId,
      otherUserId,
    );
    await expect(
      insertTextPart({
        ...fixture,
        partId: randomUUID(),
        sequence: 1,
        consentId: otherConsentId,
      }),
    ).rejects.toThrow(/MODEL_EXCHANGE_PART_CONSENT_INVALID/);
  });

  it("rejects quarantined asset permit and exchange references", async () => {
    const fixture = await createExchangeFixture();
    const quarantinedRevisionId = randomUUID();
    await database!.contentAssetRevision.create({
      data: {
        id: quarantinedRevisionId,
        assetId: fixture.assetId,
        revisionNo: 2,
        filename: "quarantined.txt",
        declaredMimeType: "text/plain",
        byteSize: 8n,
        contentHash: digest(`quarantined:${quarantinedRevisionId}`),
        objectRef: `quarantine/${quarantinedRevisionId}`,
        objectVersion: "v1",
      },
    });

    await expect(
      database!.modelExecutionPermitAssetRevisionTarget.create({
        data: {
          permitId: fixture.permitId,
          assetRevisionId: quarantinedRevisionId,
        },
      }),
    ).rejects.toThrow(/CONTENT_ASSET_REVISION_NOT_REFERENCEABLE/);
    await expect(
      insertAssetPart(fixture, quarantinedRevisionId),
    ).rejects.toThrow(/CONTENT_ASSET_REVISION_NOT_REFERENCEABLE/);
    await expect(
      insertAssetPart(fixture, fixture.assetRevisionId),
    ).resolves.toBe(1);
  });

  it("requires withdrawal to hide optional parts with a bounded purge deadline", async () => {
    const fixture = await createExchangeFixture();
    await insertTextPart(fixture);

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ConsentRecord" (
           "id", "userId", "purpose", "categories", "policyVersion", "decision"
         ) VALUES (
           $1::uuid, $2::uuid, 'OPTIONAL_MODEL_EXCHANGE',
           ARRAY['MODEL_OUTPUT']::"ConsentDataCategory"[], 'test/2', 'WITHDRAWN'
         )`,
        randomUUID(),
        fixture.userId,
      ),
    ).rejects.toThrow(/MODEL_EXCHANGE_WITHDRAWAL_NOT_APPLIED/);

    await database!.$transaction(async (transaction) => {
      const withdrawnAt = new Date();
      await transaction.modelExchangePart.updateMany({
        where: { id: fixture.partId },
        data: {
          hiddenAt: withdrawnAt,
          purgeAfter: new Date(withdrawnAt.getTime() + 30 * 24 * 60 * 60_000),
        },
      });
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ConsentRecord" (
           "id", "userId", "purpose", "categories", "policyVersion",
           "decision", "occurredAt"
         ) VALUES (
           $1::uuid, $2::uuid, 'OPTIONAL_MODEL_EXCHANGE',
           ARRAY['MODEL_OUTPUT']::"ConsentDataCategory"[], 'test/2',
           'WITHDRAWN', $3
         )`,
        randomUUID(),
        fixture.userId,
        withdrawnAt,
      );
    });
  });
});

interface ExchangeFixture {
  assetId: string;
  assetRevisionId: string;
  bodyId: string;
  consentId: string;
  exchangeId: string;
  partId: string;
  permitId: string;
  role?: "ASSISTANT" | "SYSTEM";
  sequence?: number;
  userId: string;
}

async function createExchangeFixture(): Promise<ExchangeFixture> {
  const userId = await createUser();
  const assetId = randomUUID();
  const revisionId = randomUUID();
  const routeId = randomUUID();
  const profileId = randomUUID();
  const credentialId = randomUUID();
  const permitId = randomUUID();
  const invocationId = randomUUID();
  const exchangeId = randomUUID();
  const consentId = randomUUID();
  const bodyId = randomUUID();
  const requestKey = `model-content-permit:${permitId}`;

  await database!.$executeRawUnsafe(
    `INSERT INTO "ContentAsset" ("id", "ownerUserId", "purpose", "status")
     VALUES ($1::uuid, $2::uuid, 'USER_UPLOAD', 'READY')`,
    assetId,
    userId,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "ContentAssetRevision" (
       "id", "assetId", "revisionNo", "filename", "declaredMimeType",
       "detectedMimeType", "byteSize", "contentHash", "objectRef",
       "objectVersion", "scannerVersion", "validatorVersion", "status"
     ) VALUES (
       $1::uuid, $2::uuid, 1, 'exchange.txt', 'text/plain', 'text/plain', 8,
       $3, $4, 'v1', 'fixture-scanner/1', 'fixture-validator/1', 'READY'
     )`,
    revisionId,
    assetId,
    digest(`asset:${revisionId}`),
    `s3://model-content/${revisionId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "ProviderRouteRelease" (
       "id", "providerKey", "modelId", "endpointClass", "capabilities",
       "adapterVersion", "pricingVersion", "pricing", "policyVersion",
       "releaseDigest", "status"
     ) VALUES (
       $1::uuid, $2, 'fixture-model', 'VISION',
       ARRAY['VISION']::"ModelCapabilityKind"[], 'adapter/1', 'pricing/1',
       '{}'::jsonb, 'policy/1', $3, 'PUBLISHED'
     )`,
    routeId,
    `content-provider-${routeId}`,
    digest(`route:${routeId}`),
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "CredentialProfile" (
       "id", "ownerKind", "providerKey", "label", "status"
     ) VALUES ($1::uuid, 'PLATFORM', $2, 'Content fixture', 'PENDING')`,
    profileId,
    `content-provider-${routeId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "CredentialRevision" (
       "id", "profileId", "revisionNo", "credentialType", "status",
       "ciphertext", "nonce", "authTag", "encryptedDek", "dekNonce",
       "dekAuthTag", "kekVersion", "aadSchemaVersion", "fingerprint",
       "fingerprintVersion", "maskedHint", "metadata", "validatedAt"
     ) VALUES (
       $1::uuid, $2::uuid, 1, 'API_KEY', 'VERIFIED', decode('01', 'hex'),
       decode('01', 'hex'), decode('01', 'hex'), decode('01', 'hex'),
       decode('01', 'hex'), decode('01', 'hex'), 'test-kek/1', 'test-aad/1',
       $3, 'test/1', '...test', '{}'::jsonb, now()
     )`,
    credentialId,
    profileId,
    digest(`credential:${credentialId}`),
  );
  await database!.$executeRawUnsafe(
    `UPDATE "CredentialProfile"
     SET "currentRevisionId" = $1::uuid, "status" = 'VERIFIED'
     WHERE "id" = $2::uuid`,
    credentialId,
    profileId,
  );

  await database!.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ModelExecutionPermit" (
         "id", "callerServiceKey", "purpose", "ownerType", "ownerUserId",
         "routeReleaseId", "credentialRevisionId", "operation", "inputDigest",
         "maxInputTokens", "maxOutputTokens", "maxCostMicros", "retentionMode",
         "requestKey", "expiresAt"
       ) VALUES (
         $1::uuid, 'content-test', 'ASSET_PROCESSING', 'ASSET_REVISION', $2::uuid,
         $3::uuid, $4::uuid, 'VISION_ANALYSIS', $5, 10, 5, 100,
         'ENCRYPTED_EXCHANGE', $6, now() + interval '5 minutes'
       )`,
      permitId,
      userId,
      routeId,
      credentialId,
      digest(`input:${permitId}`),
      requestKey,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ModelExecutionPermitAssetRevisionTarget" ("permitId", "assetRevisionId")
       VALUES ($1::uuid, $2::uuid)`,
      permitId,
      revisionId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ModelUsageLedger" (
         "id", "userId", "purpose", "ownerType", "ownerId", "routeReleaseId",
         "permitId", "credentialOwnerKind", "entryType", "units", "costMicros",
         "idempotencyKey"
       ) VALUES (
         $1::uuid, $2::uuid, 'ASSET_PROCESSING', 'ASSET_REVISION', $3::uuid,
         $4::uuid, $5::uuid, 'PLATFORM', 'RESERVATION', 15, 100, $6
       )`,
      randomUUID(),
      userId,
      revisionId,
      routeId,
      permitId,
      requestKey,
    );
  });
  await database!.$transaction(async (transaction) => {
    const claimedAt = new Date();
    await transaction.modelExecutionPermit.update({
      where: { id: permitId },
      data: { status: "CLAIMED", claimedAt },
    });
    await transaction.modelInvocation.create({
      data: {
        id: invocationId,
        permitId,
        purpose: "ASSET_PROCESSING",
        ownerType: "ASSET_REVISION",
        ownerId: revisionId,
        routeReleaseId: routeId,
        credentialRevisionId: credentialId,
        idempotencyKey: `permit:${permitId}`,
        inputDigest: digest(`input:${permitId}`),
      },
    });
  });
  await database!.$executeRawUnsafe(
    `INSERT INTO "ModelExchange" (
       "id", "invocationId", "exchangeKind", "retentionClass"
     ) VALUES ($1::uuid, $2::uuid, 'RESPONSE', 'USER_CONTROLLED')`,
    exchangeId,
    invocationId,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "ConsentRecord" (
       "id", "userId", "purpose", "categories", "policyVersion", "decision"
     ) VALUES (
       $1::uuid, $2::uuid, 'OPTIONAL_MODEL_EXCHANGE',
       ARRAY['MODEL_OUTPUT', 'ASSET_CONTENT']::"ConsentDataCategory"[], 'test/1', 'GRANTED'
     )`,
    consentId,
    userId,
  );
  await createBody(userId, bodyId, assetId);
  return {
    bodyId,
    consentId,
    exchangeId,
    partId: randomUUID(),
    assetId,
    assetRevisionId: revisionId,
    permitId,
    userId,
  };
}

async function insertTextPart(fixture: ExchangeFixture): Promise<number> {
  return database!.$executeRawUnsafe(
    `INSERT INTO "ModelExchangePart" (
       "id", "exchangeId", "sequence", "role", "kind", "contentBodyId",
       "consentRecordId", "visibility", "languageTag", "redactionVersion",
       "retentionClass"
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4::"ModelExchangePartRole", 'TEXT', $5::uuid,
       $6::uuid, 'USER', 'en', 'model-exchange-redaction/1', 'USER_CONTROLLED'
     )`,
    fixture.partId,
    fixture.exchangeId,
    fixture.sequence ?? 0,
    fixture.role ?? "ASSISTANT",
    fixture.bodyId,
    fixture.consentId,
  );
}

async function insertAssetPart(
  fixture: ExchangeFixture,
  assetRevisionId: string,
): Promise<number> {
  return database!.$executeRawUnsafe(
    `INSERT INTO "ModelExchangePart" (
       "id", "exchangeId", "sequence", "role", "kind", "assetRevisionId",
       "consentRecordId", "visibility", "redactionVersion", "retentionClass"
     ) VALUES (
       $1::uuid, $2::uuid, 0, 'ASSISTANT', 'ASSET_REFERENCE', $3::uuid,
       $4::uuid, 'USER', 'model-exchange-redaction/1', 'USER_CONTROLLED'
     )`,
    randomUUID(),
    fixture.exchangeId,
    assetRevisionId,
    fixture.consentId,
  );
}

async function createBody(
  userId: string,
  id = randomUUID(),
  ownerResourceId?: string,
): Promise<string> {
  await database!.$executeRawUnsafe(
    `INSERT INTO "ModelContentBody" (
       "id", "ownerKind", "ownerUserId", "ownerResourceId", "purpose",
       "ciphertext", "nonce", "authTag", "encryptedDek", "dekNonce",
       "dekAuthTag", "kekVersion", "aadSchemaVersion", "contentHash",
       "requestKey", "visibility", "retentionClass"
     ) VALUES (
       $1::uuid, $2::"ModelContentOwnerKind", $3::uuid, $4::uuid,
       $5::"ModelPurposeKind", decode('01', 'hex'),
       decode(repeat('01', 12), 'hex'), decode(repeat('01', 16), 'hex'),
       decode('01', 'hex'), decode(repeat('01', 12), 'hex'),
       decode(repeat('01', 16), 'hex'), 'test-kek/1', 'model-content-body/1',
       $6, $7, 'USER', 'USER_CONTROLLED'
     )`,
    id,
    ownerResourceId ? "ASSET_PROCESSING" : "AGENT_MESSAGE",
    userId,
    ownerResourceId ?? null,
    ownerResourceId ? "ASSET_PROCESSING" : "AGENT_RUN",
    digest(`body:${id}`),
    `model-content:${id}`,
  );
  return id;
}

async function createUser(): Promise<string> {
  const id = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "displayName") VALUES ($1::uuid, $2)`,
    id,
    `model-content-${id}`,
  );
  return id;
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
