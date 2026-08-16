import { createHash, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

type CredentialOwner = "PLATFORM" | "USER";
type UsageEntry = "CORRECTION" | "RELEASE" | "RESERVATION" | "SETTLEMENT";

interface UsageFixture {
  assetRevisionId: string;
  credentialOwnerKind: CredentialOwner;
  credentialRevisionId: string;
  inputDigest: string;
  permitId: string;
  requestKey: string;
  routeReleaseId: string;
  userId: string;
}

interface UsageInsert {
  costMicros?: bigint;
  credentialOwnerKind?: CredentialOwner;
  entryType?: UsageEntry;
  idempotencyKey?: string;
  ownerId?: string;
  ownerType?: "ASSET_REVISION" | "BUILD_RUN";
  permitId?: string;
  purpose?: "ASSET_PROCESSING" | "LEXICON_BUILD";
  routeReleaseId?: string;
  units?: bigint;
  userId?: string;
}

interface ConsumptionOptions {
  credentialOwnerKind?: CredentialOwner;
  releaseCostMicros?: bigint;
  releaseUnits?: bigint;
  settlementCostMicros?: bigint;
  settlementUnits?: bigint;
  writeRelease?: boolean;
  writeSettlement?: boolean;
}

describeDatabase("model usage ledger invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("installs the same-key indexes, foreign keys, and insert guard", async () => {
    const indexes = await database!.$queryRaw<Array<{ indexName: string }>>`
      SELECT indexname AS "indexName"
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'ModelUsageLedger'
      ORDER BY indexname
    `;
    const indexNames = indexes.map(({ indexName }) => indexName);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "ModelUsageLedger_idempotencyKey_entryType_key",
        "ModelUsageLedger_permitId_entryType_key",
      ]),
    );
    expect(indexNames).not.toContain("ModelUsageLedger_idempotencyKey_key");

    const constraints = await database!.$queryRaw<
      Array<{ constraintName: string }>
    >`
      SELECT conname AS "constraintName"
      FROM pg_constraint
      WHERE conrelid = '"ModelUsageLedger"'::regclass
      ORDER BY conname
    `;
    expect(constraints.map(({ constraintName }) => constraintName)).toEqual(
      expect.arrayContaining([
        "ModelUsageLedger_permitId_fkey",
        "ModelUsageLedger_routeReleaseId_fkey",
      ]),
    );

    const triggers = await database!.$queryRaw<Array<{ triggerName: string }>>`
      SELECT tgname AS "triggerName"
      FROM pg_trigger
      WHERE tgrelid = '"ModelUsageLedger"'::regclass
        AND NOT tgisinternal
      ORDER BY tgname
    `;
    expect(triggers.map(({ triggerName }) => triggerName)).toEqual(
      expect.arrayContaining([
        "ModelUsageLedger_append_only",
        "ModelUsageLedger_closure_guard",
        "ModelUsageLedger_insert_guard",
      ]),
    );
    const permitTriggers = await database!.$queryRaw<
      Array<{ triggerName: string }>
    >`
      SELECT tgname AS "triggerName"
      FROM pg_trigger
      WHERE tgrelid = '"ModelExecutionPermit"'::regclass
        AND NOT tgisinternal
      ORDER BY tgname
    `;
    expect(permitTriggers.map(({ triggerName }) => triggerName)).toContain(
      "ModelExecutionPermit_usage_closure_guard",
    );
  });

  it("uses one idempotency key for reservation, settlement, and release", async () => {
    const fixture = await createUsageFixture("PLATFORM");
    await consumePermit(fixture, {
      settlementUnits: 9n,
      settlementCostMicros: 40n,
    });

    const entries = await database!.modelUsageLedger.findMany({
      where: { permitId: fixture.permitId },
      orderBy: { entryType: "asc" },
    });
    expect(entries).toHaveLength(3);
    expect(
      new Set(entries.map(({ idempotencyKey }) => idempotencyKey)),
    ).toEqual(new Set([fixture.requestKey]));
    expect(entries.map(({ entryType }) => entryType).sort()).toEqual([
      "RELEASE",
      "RESERVATION",
      "SETTLEMENT",
    ]);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          credentialOwnerKind: "PLATFORM",
          userId: fixture.userId,
        }),
      ]),
    );
  });

  it("rejects duplicate entry types for the same permit", async () => {
    const fixture = await createUsageFixture("PLATFORM");

    await expect(
      insertUsage(fixture, { entryType: "RESERVATION" }),
    ).rejects.toThrow(
      /ModelUsageLedger_(idempotencyKey_entryType|permitId_entryType)_key|duplicate key|already exists/,
    );
  });

  it("rejects permit, route, typed owner, user, and credential-owner drift", async () => {
    const fixture = await createUsageFixture("PLATFORM");
    const otherRouteId = await createProviderRoute();
    const otherUserId = await createUser("usage-other-owner");

    await expect(
      insertUsage(fixture, { permitId: randomUUID() }),
    ).rejects.toThrow(/MODEL_USAGE_PERMIT_NOT_FOUND/);
    await expect(
      insertUsage(fixture, { routeReleaseId: otherRouteId }),
    ).rejects.toThrow(/MODEL_USAGE_BINDING_INVALID/);
    await expect(
      insertUsage(fixture, { ownerId: randomUUID() }),
    ).rejects.toThrow(/MODEL_USAGE_BINDING_INVALID/);
    await expect(
      insertUsage(fixture, {
        ownerType: "BUILD_RUN",
        purpose: "LEXICON_BUILD",
      }),
    ).rejects.toThrow(/MODEL_USAGE_BINDING_INVALID/);
    await expect(insertUsage(fixture, { userId: otherUserId })).rejects.toThrow(
      /MODEL_USAGE_BINDING_INVALID/,
    );
    await expect(
      insertUsage(fixture, { credentialOwnerKind: "USER" }),
    ).rejects.toThrow(/MODEL_USAGE_BINDING_INVALID/);
  });

  it("never records a USER BYOK settlement as PLATFORM usage", async () => {
    const fixture = await createUsageFixture("USER");

    await expect(
      consumePermit(fixture, {
        credentialOwnerKind: "PLATFORM",
        settlementUnits: 0n,
        settlementCostMicros: 0n,
      }),
    ).rejects.toThrow(/MODEL_USAGE_BYOK_PLATFORM_SETTLEMENT_INVALID/);
    await expect(
      database!.modelUsageLedger.count({
        where: {
          permitId: fixture.permitId,
          entryType: "SETTLEMENT",
          credentialOwnerKind: "PLATFORM",
        },
      }),
    ).resolves.toBe(0);
  });

  it("enforces reservation, settlement, release, and correction shapes", async () => {
    await expect(
      createUsageFixture("PLATFORM", { units: 14n, costMicros: 100n }),
    ).rejects.toThrow(/MODEL_USAGE_RESERVATION_INVALID/);

    const fixture = await createUsageFixture("PLATFORM");

    await expect(
      insertUsage(fixture, {
        entryType: "SETTLEMENT",
        units: 1n,
        costMicros: 1n,
      }),
    ).rejects.toThrow(/MODEL_USAGE_SETTLEMENT_INVALID/);

    await expect(
      consumePermit(fixture, {
        settlementUnits: 16n,
        settlementCostMicros: 100n,
      }),
    ).rejects.toThrow(/MODEL_USAGE_SETTLEMENT_INVALID/);
    await expect(
      consumePermit(fixture, {
        releaseUnits: -14n,
        releaseCostMicros: -100n,
      }),
    ).rejects.toThrow(/MODEL_USAGE_RELEASE_INVALID/);
    await expect(
      insertUsage(fixture, {
        entryType: "CORRECTION",
        units: 0n,
        costMicros: 0n,
      }),
    ).rejects.toThrow(/MODEL_USAGE_CORRECTION_INVALID/);
  });

  it("requires every terminal permit to close its reservation atomically", async () => {
    const consumed = await createUsageFixture("PLATFORM");
    await expect(
      consumePermit(consumed, {
        writeSettlement: false,
        writeRelease: false,
      }),
    ).rejects.toThrow(/MODEL_USAGE_TERMINAL_INCOMPLETE/);

    const revoked = await createUsageFixture("PLATFORM");
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.modelExecutionPermit.update({
          where: { id: revoked.permitId },
          data: { status: "REVOKED" },
        });
      }),
    ).rejects.toThrow(/MODEL_USAGE_UNUSED_TERMINAL_INVALID/);
  });

  it("bounds corrections by the original reservation", async () => {
    const fixture = await createUsageFixture("PLATFORM");
    await consumePermit(fixture, {
      settlementUnits: 9n,
      settlementCostMicros: 40n,
    });

    await expect(
      insertUsage(fixture, {
        entryType: "CORRECTION",
        units: 7n,
        costMicros: 0n,
      }),
    ).rejects.toThrow(/MODEL_USAGE_CORRECTION_TOTAL_INVALID/);
  });

  it("keeps usage entries append-only", async () => {
    const fixture = await createUsageFixture("PLATFORM");
    const reservation = await database!.modelUsageLedger.findFirstOrThrow({
      where: { permitId: fixture.permitId, entryType: "RESERVATION" },
    });

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "ModelUsageLedger" SET "units" = "units" + 1
         WHERE "id" = $1::uuid`,
        reservation.id,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      database!.$executeRawUnsafe(
        `DELETE FROM "ModelUsageLedger" WHERE "id" = $1::uuid`,
        reservation.id,
      ),
    ).rejects.toThrow(/append-only/);
  });
});

async function createUsageFixture(
  credentialOwnerKind: CredentialOwner,
  reservation: { units: bigint; costMicros: bigint } = {
    units: 15n,
    costMicros: 100n,
  },
): Promise<UsageFixture> {
  const userId = await createUser("usage-ledger-owner");
  const assetId = randomUUID();
  const assetRevisionId = randomUUID();
  const routeReleaseId = await createProviderRoute();
  const profileId = randomUUID();
  const credentialRevisionId = randomUUID();
  const permitId = randomUUID();
  const requestKey = `usage:${permitId}`;
  const inputDigest = hash(`usage-input:${permitId}`);

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
       $1::uuid, $2::uuid, 1, 'usage.txt', 'text/plain', 'text/plain', 5,
       $3, $4, 'version-1', 'fixture-scanner/1', 'fixture-validator/1', 'READY'
     )`,
    assetRevisionId,
    assetId,
    hash(`asset:${assetRevisionId}`),
    `s3://usage-tests/${assetRevisionId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "CredentialProfile" (
       "id", "ownerKind", "ownerUserId", "providerKey", "label", "status"
     ) VALUES (
       $1::uuid, $2::"CredentialOwnerKind", $3::uuid, $4, 'Usage test', 'PENDING'
     )`,
    profileId,
    credentialOwnerKind,
    credentialOwnerKind === "USER" ? userId : null,
    `usage-provider-${routeReleaseId}`,
  );
  await database!.$executeRawUnsafe(
    `INSERT INTO "CredentialRevision" (
       "id", "profileId", "revisionNo", "credentialType", "status",
       "ciphertext", "nonce", "authTag", "encryptedDek", "dekNonce",
       "dekAuthTag", "kekVersion", "aadSchemaVersion", "fingerprint",
       "fingerprintVersion", "maskedHint", "metadata", "validatedAt"
     ) VALUES (
       $1::uuid, $2::uuid, 1, 'API_KEY', 'VERIFIED',
       decode('0102', 'hex'), decode('0102', 'hex'), decode('0102', 'hex'),
       decode('0102', 'hex'), decode('0102', 'hex'), decode('0102', 'hex'),
       'test-kek/1', 'test-aad/1', $3, 'test-fingerprint/1', '...test',
       '{}'::jsonb, now()
     )`,
    credentialRevisionId,
    profileId,
    hash(`credential:${credentialRevisionId}`),
  );
  await database!.$executeRawUnsafe(
    `UPDATE "CredentialProfile"
     SET "currentRevisionId" = $1::uuid, "status" = 'VERIFIED'
     WHERE "id" = $2::uuid`,
    credentialRevisionId,
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
         $1::uuid, 'usage-test', 'ASSET_PROCESSING', 'ASSET_REVISION', $2::uuid,
         $3::uuid, $4::uuid, 'VISION_ANALYSIS', $5, 10, 5, 100,
         'AUDIT_METADATA_ONLY', $6, now() + interval '5 minutes'
       )`,
      permitId,
      userId,
      routeReleaseId,
      credentialRevisionId,
      inputDigest,
      requestKey,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ModelExecutionPermitAssetRevisionTarget" (
         "permitId", "assetRevisionId"
       ) VALUES ($1::uuid, $2::uuid)`,
      permitId,
      assetRevisionId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ModelUsageLedger" (
         "id", "userId", "purpose", "ownerType", "ownerId", "routeReleaseId",
         "permitId", "credentialOwnerKind", "entryType", "units", "costMicros",
         "idempotencyKey"
       ) VALUES (
         $1::uuid, $2::uuid, 'ASSET_PROCESSING', 'ASSET_REVISION', $3::uuid,
         $4::uuid, $5::uuid, $6::"CredentialOwnerKind", 'RESERVATION', $7,
         $8, $9
       )`,
      randomUUID(),
      userId,
      assetRevisionId,
      routeReleaseId,
      permitId,
      credentialOwnerKind,
      reservation.units,
      reservation.costMicros,
      requestKey,
    );
  });

  return {
    assetRevisionId,
    credentialOwnerKind,
    credentialRevisionId,
    inputDigest,
    permitId,
    requestKey,
    routeReleaseId,
    userId,
  };
}

async function consumePermit(
  fixture: UsageFixture,
  options: ConsumptionOptions = {},
): Promise<void> {
  await database!.$transaction(async (transaction) => {
    const claimedAt = new Date();
    await transaction.modelExecutionPermit.update({
      where: { id: fixture.permitId },
      data: { status: "CLAIMED", claimedAt },
    });
    await transaction.modelInvocation.create({
      data: {
        permitId: fixture.permitId,
        purpose: "ASSET_PROCESSING",
        ownerType: "ASSET_REVISION",
        ownerId: fixture.assetRevisionId,
        routeReleaseId: fixture.routeReleaseId,
        credentialRevisionId: fixture.credentialRevisionId,
        idempotencyKey: `permit:${fixture.permitId}`,
        inputDigest: fixture.inputDigest,
      },
    });
    await transaction.modelExecutionPermit.update({
      where: { id: fixture.permitId },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });
    if (options.writeSettlement !== false) {
      await transaction.modelUsageLedger.create({
        data: {
          userId: fixture.userId,
          purpose: "ASSET_PROCESSING",
          ownerType: "ASSET_REVISION",
          ownerId: fixture.assetRevisionId,
          routeReleaseId: fixture.routeReleaseId,
          permitId: fixture.permitId,
          credentialOwnerKind:
            options.credentialOwnerKind ?? fixture.credentialOwnerKind,
          entryType: "SETTLEMENT",
          units: options.settlementUnits ?? 0n,
          costMicros: options.settlementCostMicros ?? 0n,
          idempotencyKey: fixture.requestKey,
        },
      });
    }
    if (options.writeRelease !== false) {
      await transaction.modelUsageLedger.create({
        data: {
          userId: fixture.userId,
          purpose: "ASSET_PROCESSING",
          ownerType: "ASSET_REVISION",
          ownerId: fixture.assetRevisionId,
          routeReleaseId: fixture.routeReleaseId,
          permitId: fixture.permitId,
          credentialOwnerKind: fixture.credentialOwnerKind,
          entryType: "RELEASE",
          units: options.releaseUnits ?? -15n,
          costMicros: options.releaseCostMicros ?? -100n,
          idempotencyKey: fixture.requestKey,
        },
      });
    }
  });
}

async function insertUsage(
  fixture: UsageFixture,
  overrides: UsageInsert = {},
): Promise<number> {
  return database!.$executeRawUnsafe(
    `INSERT INTO "ModelUsageLedger" (
       "id", "userId", "purpose", "ownerType", "ownerId", "routeReleaseId",
       "permitId", "credentialOwnerKind", "entryType", "units", "costMicros",
       "idempotencyKey"
     ) VALUES (
       $1::uuid, $2::uuid, $3::"ModelPurposeKind", $4::"ModelExecutionOwnerType",
       $5::uuid, $6::uuid, $7::uuid, $8::"CredentialOwnerKind",
       $9::"ModelUsageEntryType", $10, $11, $12
     )`,
    randomUUID(),
    overrides.userId ?? fixture.userId,
    overrides.purpose ?? "ASSET_PROCESSING",
    overrides.ownerType ?? "ASSET_REVISION",
    overrides.ownerId ?? fixture.assetRevisionId,
    overrides.routeReleaseId ?? fixture.routeReleaseId,
    overrides.permitId ?? fixture.permitId,
    overrides.credentialOwnerKind ?? fixture.credentialOwnerKind,
    overrides.entryType ?? "RESERVATION",
    overrides.units ?? 15n,
    overrides.costMicros ?? 100n,
    overrides.idempotencyKey ?? fixture.requestKey,
  );
}

async function createProviderRoute(): Promise<string> {
  const id = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "ProviderRouteRelease" (
       "id", "providerKey", "modelId", "endpointClass", "capabilities",
       "adapterVersion", "pricingVersion", "pricing", "policyVersion",
       "releaseDigest", "status"
     ) VALUES (
       $1::uuid, $2, 'usage-model', 'VISION',
       ARRAY['VISION']::"ModelCapabilityKind"[], 'adapter/1', 'pricing/1',
       '{}'::jsonb, 'policy/1', $3, 'PUBLISHED'
     )`,
    id,
    `usage-provider-${id}`,
    hash(`route:${id}`),
  );
  return id;
}

async function createUser(prefix: string): Promise<string> {
  const id = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "displayName") VALUES ($1::uuid, $2)`,
    id,
    `${prefix}-${id}`,
  );
  return id;
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
