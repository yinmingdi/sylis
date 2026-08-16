import { Inject, Injectable } from "@nestjs/common";
import type {
  ModelContentFragmentInput,
  ModelContentFragmentRef,
  ModelContentFragmentSnapshot,
} from "@sylis/agent-contracts";
import { createContentCrypto } from "@sylis/content-crypto";
import {
  ContentAssetStatus,
  ModelContentOwnerKind,
  ModelContentRetentionClass,
  ModelContentVisibility,
  ModelRetentionMode,
  Prisma,
  type ModelPurposeKind,
  type SylisDatabase,
} from "@sylis/database";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { ModelGatewayConfig } from "../../config/model-gateway.config";
import { MODEL_DATABASE } from "../../platform/database/database.module";

export interface CreateModelContentBodyInput {
  id?: string;
  ownerKind: ModelContentOwnerKind;
  ownerUserId?: string | null;
  ownerResourceId?: string | null;
  purpose: ModelPurposeKind;
  plaintext: string;
  visibility: ModelContentVisibility;
  retentionClass: ModelContentRetentionClass;
  idempotencyKey: string;
}

@Injectable()
export class ModelContentBodyService {
  private readonly crypto;

  constructor(
    @Inject(MODEL_DATABASE) private readonly database: SylisDatabase,
    config: ModelGatewayConfig,
  ) {
    this.crypto = createContentCrypto({
      currentVersion: () => config.contentKekVersion,
      key: (version) => {
        const value = config.contentKeks[version];
        if (!value) throw new Error("MODEL_CONTENT_KEK_NOT_FOUND");
        return value;
      },
    });
  }

  async create(
    serviceKey: string,
    input: CreateModelContentBodyInput,
  ): Promise<{ id: string; contentHash: string }> {
    assertContentWriter(serviceKey);
    assertContentOwnership(input);
    const requestKey = `${serviceKey}:${input.idempotencyKey}`;
    const contentHash = digest(input.plaintext);
    const existing = await this.database.modelContentBody.findUnique({
      where: { requestKey },
    });
    if (existing) {
      if (
        existing.ownerKind !== input.ownerKind ||
        existing.ownerUserId !== (input.ownerUserId ?? null) ||
        existing.ownerResourceId !== (input.ownerResourceId ?? null) ||
        existing.purpose !== input.purpose ||
        existing.visibility !== input.visibility ||
        existing.retentionClass !== input.retentionClass ||
        existing.contentHash !== contentHash
      ) {
        throw new Error("MODEL_CONTENT_IDEMPOTENCY_CONFLICT");
      }
      if (input.ownerKind === ModelContentOwnerKind.ASSET_PROCESSING) {
        await this.assertAssetProcessable(input);
      }
      return { id: existing.id, contentHash: existing.contentHash };
    }
    const id = input.id ?? randomUUID();
    const schemaVersion = "model-content-body/1";
    const envelope = await this.crypto.encrypt(
      Buffer.from(input.plaintext, "utf8"),
      {
        ownerKind: input.ownerKind,
        ownerId: input.ownerResourceId ?? input.ownerUserId ?? input.ownerKind,
        purpose: input.purpose,
        recordId: id,
        schemaVersion,
      },
    );
    const data = {
      id,
      ownerKind: input.ownerKind,
      ownerUserId: input.ownerUserId ?? null,
      ownerResourceId: input.ownerResourceId ?? null,
      purpose: input.purpose,
      ciphertext: Buffer.from(envelope.ciphertext, "base64"),
      nonce: Buffer.from(envelope.nonce, "base64"),
      authTag: Buffer.from(envelope.authTag, "base64"),
      encryptedDek: Buffer.from(envelope.encryptedDek, "base64"),
      dekNonce: Buffer.from(envelope.dekNonce, "base64"),
      dekAuthTag: Buffer.from(envelope.dekAuthTag, "base64"),
      kekVersion: envelope.kekVersion,
      aadSchemaVersion: envelope.aadSchemaVersion,
      contentHash,
      requestKey,
      visibility: input.visibility,
      retentionClass: input.retentionClass,
    };
    const created =
      input.ownerKind === ModelContentOwnerKind.ASSET_PROCESSING
        ? await this.database.$transaction(async (transaction) => {
            if (!input.ownerResourceId || !input.ownerUserId) {
              throw new Error("ASSET_CONTENT_OWNER_REQUIRED");
            }
            await transaction.$queryRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.ownerResourceId}, 1398361))::text`,
            );
            const asset = await transaction.contentAsset.findFirst({
              where: {
                id: input.ownerResourceId,
                ownerUserId: input.ownerUserId,
                status: {
                  notIn: [
                    ContentAssetStatus.HIDDEN,
                    ContentAssetStatus.DELETED,
                  ],
                },
              },
              select: { id: true },
            });
            if (!asset) throw new Error("CONTENT_ASSET_NOT_PROCESSABLE");
            return transaction.modelContentBody.create({ data });
          })
        : await this.database.modelContentBody.create({ data });
    return { id: created.id, contentHash: created.contentHash };
  }

  async read(
    serviceKey: string,
    id: string,
    ownerUserId: string,
  ): Promise<{ id: string; plaintext: string; contentHash: string }> {
    assertContentReader(serviceKey);
    const body = await this.database.modelContentBody.findFirst({
      where: { id, ownerUserId, hiddenAt: null, purgedAt: null },
      include: {
        fragments: {
          orderBy: { fragmentSequence: "desc" },
          take: 1,
        },
      },
    });
    if (!body) throw new Error("MODEL_CONTENT_NOT_FOUND");
    const latestFragment = body.fragments[0];
    const encrypted = latestFragment ?? body;
    const plaintext = await this.crypto.decrypt(
      {
        algorithm: "AES-256-GCM",
        ciphertext: Buffer.from(encrypted.ciphertext).toString("base64"),
        nonce: Buffer.from(encrypted.nonce).toString("base64"),
        authTag: Buffer.from(encrypted.authTag).toString("base64"),
        encryptedDek: Buffer.from(encrypted.encryptedDek).toString("base64"),
        dekNonce: Buffer.from(encrypted.dekNonce).toString("base64"),
        dekAuthTag: Buffer.from(encrypted.dekAuthTag).toString("base64"),
        kekVersion: encrypted.kekVersion,
        aadSchemaVersion: encrypted.aadSchemaVersion,
      },
      latestFragment
        ? {
            ownerKind: "agent-message-fragment",
            ownerId: body.id,
            purpose: body.purpose,
            recordId: latestFragment.id,
            schemaVersion: latestFragment.aadSchemaVersion,
          }
        : {
            ownerKind: body.ownerKind,
            ownerId: body.ownerResourceId ?? body.ownerUserId ?? body.ownerKind,
            purpose: body.purpose,
            recordId: body.id,
            schemaVersion: body.aadSchemaVersion,
          },
    );
    return {
      id: body.id,
      plaintext: Buffer.from(plaintext).toString("utf8"),
      contentHash: latestFragment?.fragmentHash ?? body.contentHash,
    };
  }

  async readAgentFragment(
    serviceKey: string,
    id: string,
    ownerUserId: string,
  ): Promise<ModelContentFragmentSnapshot> {
    assertContentReader(serviceKey);
    const fragment = await this.database.modelContentFragment.findFirst({
      where: {
        id,
        body: { ownerUserId, hiddenAt: null, purgedAt: null },
      },
      include: { body: true },
    });
    if (!fragment) throw new Error("MODEL_CONTENT_FRAGMENT_NOT_FOUND");
    const plaintext = await this.crypto.decrypt(
      {
        algorithm: "AES-256-GCM",
        ciphertext: Buffer.from(fragment.ciphertext).toString("base64"),
        nonce: Buffer.from(fragment.nonce).toString("base64"),
        authTag: Buffer.from(fragment.authTag).toString("base64"),
        encryptedDek: Buffer.from(fragment.encryptedDek).toString("base64"),
        dekNonce: Buffer.from(fragment.dekNonce).toString("base64"),
        dekAuthTag: Buffer.from(fragment.dekAuthTag).toString("base64"),
        kekVersion: fragment.kekVersion,
        aadSchemaVersion: fragment.aadSchemaVersion,
      },
      {
        ownerKind: "agent-message-fragment",
        ownerId: fragment.bodyId,
        purpose: fragment.body.purpose,
        recordId: fragment.id,
        schemaVersion: fragment.aadSchemaVersion,
      },
    );
    return {
      contentBodyId: fragment.bodyId,
      plaintext: Buffer.from(plaintext).toString("utf8"),
      contentHash: fragment.fragmentHash,
    };
  }

  async appendAgentFragment(
    serviceKey: string,
    input: ModelContentFragmentInput,
  ): Promise<ModelContentFragmentRef> {
    if (serviceKey !== "agent-executor") {
      throw new Error("MODEL_CONTENT_FRAGMENT_WRITE_FORBIDDEN");
    }
    if (
      !Number.isSafeInteger(input.modelPosition) ||
      input.modelPosition < 0 ||
      !Number.isSafeInteger(input.modelSubPosition) ||
      input.modelSubPosition < 0 ||
      !Number.isSafeInteger(input.fragmentSequence) ||
      input.fragmentSequence < 0 ||
      typeof input.serializedContent !== "string" ||
      input.serializedContent.length === 0 ||
      Buffer.byteLength(input.serializedContent, "utf8") > 64 * 1_024
    ) {
      throw new Error("MODEL_CONTENT_FRAGMENT_INPUT_INVALID");
    }
    const invocation = await this.database.modelInvocation.findUnique({
      where: { id: input.invocationId },
      include: { permit: true },
    });
    if (!invocation?.permit.ownerUserId) {
      throw new Error("MODEL_CONTENT_FRAGMENT_INVOCATION_INVALID");
    }
    const unique = {
      invocationId_modelPosition_modelSubPosition_fragmentSequence: {
        invocationId: input.invocationId,
        modelPosition: input.modelPosition,
        modelSubPosition: input.modelSubPosition,
        fragmentSequence: input.fragmentSequence,
      },
    } as const;
    const existing = await this.database.modelContentFragment.findUnique({
      where: unique,
      include: { body: true },
    });
    const fragmentHash = digest(input.serializedContent);
    if (existing) {
      if (
        existing.bodyId !== input.contentBodyId ||
        existing.fragmentHash !== fragmentHash ||
        existing.byteLength !== Buffer.byteLength(input.serializedContent)
      ) {
        throw new Error("MODEL_CONTENT_FRAGMENT_IDEMPOTENCY_CONFLICT");
      }
      return {
        contentBodyId: existing.bodyId,
        contentFragmentId: existing.id,
        contentHash: existing.fragmentHash,
        byteLength: existing.byteLength,
      };
    }
    const idempotencyKey = `agent-fragment/${input.invocationId}/${input.modelPosition}/${input.modelSubPosition}`;
    let body = await this.database.modelContentBody.findUnique({
      where: { id: input.contentBodyId },
    });
    if (!body) {
      if (input.fragmentSequence !== 0) {
        throw new Error("MODEL_CONTENT_FRAGMENT_SEQUENCE_INVALID");
      }
      await this.create(serviceKey, {
        id: input.contentBodyId,
        ownerKind: ModelContentOwnerKind.AGENT_MESSAGE,
        ownerUserId: invocation.permit.ownerUserId,
        purpose: invocation.purpose,
        plaintext: input.serializedContent,
        visibility: ModelContentVisibility.USER,
        retentionClass:
          invocation.permit.retentionMode === ModelRetentionMode.NONE
            ? ModelContentRetentionClass.TRANSIENT
            : ModelContentRetentionClass.USER_CONTROLLED,
        idempotencyKey,
      });
      body = await this.database.modelContentBody.findUniqueOrThrow({
        where: { id: input.contentBodyId },
      });
    }
    if (
      body.ownerKind !== ModelContentOwnerKind.AGENT_MESSAGE ||
      body.ownerUserId !== invocation.permit.ownerUserId ||
      body.ownerResourceId !== null ||
      body.purpose !== invocation.purpose ||
      body.requestKey !== `${serviceKey}:${idempotencyKey}` ||
      body.visibility !== ModelContentVisibility.USER ||
      body.retentionClass !==
        (invocation.permit.retentionMode === ModelRetentionMode.NONE
          ? ModelContentRetentionClass.TRANSIENT
          : ModelContentRetentionClass.USER_CONTROLLED) ||
      body.hiddenAt !== null ||
      body.purgedAt !== null ||
      body.sealedAt !== null
    ) {
      throw new Error("MODEL_CONTENT_FRAGMENT_BODY_INVALID");
    }
    const fragmentId = randomUUID();
    const schemaVersion = "model-content-fragment/1";
    const envelope = await this.crypto.encrypt(
      Buffer.from(input.serializedContent, "utf8"),
      {
        ownerKind: "agent-message-fragment",
        ownerId: body.id,
        purpose: invocation.purpose,
        recordId: fragmentId,
        schemaVersion,
      },
    );
    const byteLength = Buffer.byteLength(input.serializedContent, "utf8");
    await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.invocationId}:${input.modelPosition}:${input.modelSubPosition}`}, 1744429))::text`,
      );
      const duplicate = await transaction.modelContentFragment.findUnique({
        where: unique,
      });
      if (duplicate) {
        if (
          duplicate.bodyId !== body.id ||
          duplicate.fragmentHash !== fragmentHash ||
          duplicate.byteLength !== byteLength
        ) {
          throw new Error("MODEL_CONTENT_FRAGMENT_IDEMPOTENCY_CONFLICT");
        }
        return;
      }
      await transaction.modelContentFragment.create({
        data: {
          id: fragmentId,
          bodyId: body.id,
          invocationId: input.invocationId,
          modelPosition: input.modelPosition,
          modelSubPosition: input.modelSubPosition,
          fragmentSequence: input.fragmentSequence,
          ciphertext: Buffer.from(envelope.ciphertext, "base64"),
          nonce: Buffer.from(envelope.nonce, "base64"),
          authTag: Buffer.from(envelope.authTag, "base64"),
          encryptedDek: Buffer.from(envelope.encryptedDek, "base64"),
          dekNonce: Buffer.from(envelope.dekNonce, "base64"),
          dekAuthTag: Buffer.from(envelope.dekAuthTag, "base64"),
          kekVersion: envelope.kekVersion,
          aadSchemaVersion: schemaVersion,
          fragmentHash,
          byteLength,
        },
      });
      if (input.seal) {
        await transaction.modelContentBody.update({
          where: { id: body.id },
          data: { sealedAt: new Date() },
        });
      }
    });
    const persisted =
      await this.database.modelContentFragment.findUniqueOrThrow({
        where: unique,
      });
    return {
      contentBodyId: body.id,
      contentFragmentId: persisted.id,
      contentHash: persisted.fragmentHash,
      byteLength: persisted.byteLength,
    };
  }

  async hide(
    serviceKey: string,
    input: { ownerUserId: string; ids: readonly string[]; purgeAfter: string },
  ): Promise<{ hidden: number }> {
    assertContentLifecycleWriter(serviceKey);
    const ids = uniqueIds(input.ids);
    const purgeAfter = new Date(input.purgeAfter);
    if (!Number.isFinite(purgeAfter.getTime())) {
      throw new Error("MODEL_CONTENT_PURGE_AFTER_INVALID");
    }
    const owned = await this.database.modelContentBody.count({
      where: { id: { in: ids }, ownerUserId: input.ownerUserId },
    });
    if (owned !== ids.length) throw new Error("MODEL_CONTENT_OWNER_MISMATCH");
    const result = await this.database.modelContentBody.updateMany({
      where: {
        id: { in: ids },
        ownerUserId: input.ownerUserId,
        hiddenAt: null,
        purgedAt: null,
      },
      data: { hiddenAt: new Date(), purgeAfter },
    });
    return { hidden: result.count };
  }

  async purge(
    serviceKey: string,
    input: { ownerUserId: string; ids: readonly string[] },
  ): Promise<{ purged: number }> {
    assertContentLifecycleWriter(serviceKey);
    const ids = uniqueIds(input.ids);
    const now = new Date();
    const rows = await this.database.modelContentBody.findMany({
      where: { id: { in: ids }, ownerUserId: input.ownerUserId },
      select: { id: true, hiddenAt: true, purgeAfter: true, purgedAt: true },
    });
    if (rows.length !== ids.length)
      throw new Error("MODEL_CONTENT_OWNER_MISMATCH");
    if (
      rows.some(
        (row) =>
          !row.purgedAt &&
          (!row.hiddenAt || !row.purgeAfter || row.purgeAfter > now),
      )
    ) {
      throw new Error("MODEL_CONTENT_NOT_PURGEABLE");
    }
    const pending = rows.filter((row) => !row.purgedAt);
    return {
      purged: await this.cryptoshred(
        pending.map(({ id }) => id),
        now,
      ),
    };
  }

  async cryptoshred(ids: readonly string[], now: Date): Promise<number> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) return 0;
    const pending = await this.database.modelContentBody.findMany({
      where: { id: { in: unique }, purgedAt: null },
      select: { id: true, hiddenAt: true, purgeAfter: true },
    });
    if (pending.length === 0) return 0;
    await this.database.$transaction(async (transaction) => {
      for (const row of pending) {
        await transaction.modelContentBody.update({
          where: { id: row.id },
          data: {
            ciphertext: randomBytes(32),
            nonce: randomBytes(12),
            authTag: randomBytes(16),
            encryptedDek: randomBytes(32),
            dekNonce: randomBytes(12),
            dekAuthTag: randomBytes(16),
            kekVersion: "purged",
            contentHash: digest(`purged:${row.id}`),
            hiddenAt: row.hiddenAt ?? now,
            purgeAfter: row.purgeAfter ?? now,
            purgedAt: now,
          },
        });
        await transaction.modelContentFragment.updateMany({
          where: { bodyId: row.id },
          data: {
            ciphertext: randomBytes(32),
            nonce: randomBytes(12),
            authTag: randomBytes(16),
            encryptedDek: randomBytes(32),
            dekNonce: randomBytes(12),
            dekAuthTag: randomBytes(16),
            kekVersion: "purged",
            fragmentHash: digest(`purged-fragments:${row.id}`),
          },
        });
      }
    });
    return pending.length;
  }

  private async assertAssetProcessable(
    input: CreateModelContentBodyInput,
  ): Promise<void> {
    const ownerResourceId = input.ownerResourceId;
    const ownerUserId = input.ownerUserId;
    if (!ownerResourceId || !ownerUserId) {
      throw new Error("ASSET_CONTENT_OWNER_REQUIRED");
    }
    await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerResourceId}, 1398361))::text`,
      );
      const asset = await transaction.contentAsset.findFirst({
        where: {
          id: ownerResourceId,
          ownerUserId,
          status: {
            notIn: [ContentAssetStatus.HIDDEN, ContentAssetStatus.DELETED],
          },
        },
        select: { id: true },
      });
      if (!asset) throw new Error("CONTENT_ASSET_NOT_PROCESSABLE");
    });
  }
}

function assertContentOwnership(input: CreateModelContentBodyInput): void {
  switch (input.ownerKind) {
    case ModelContentOwnerKind.AGENT_INSTRUCTION:
    case ModelContentOwnerKind.AGENT_MESSAGE:
    case ModelContentOwnerKind.AGENT_PROPOSAL:
    case ModelContentOwnerKind.AGENT_ARTIFACT:
    case ModelContentOwnerKind.AGENT_MEMORY:
    case ModelContentOwnerKind.AGENT_TOOL_INPUT:
    case ModelContentOwnerKind.AGENT_TOOL_RESULT:
      if (!input.ownerUserId || input.ownerResourceId) {
        throw new Error("MODEL_CONTENT_OWNER_INVALID");
      }
      return;
    case ModelContentOwnerKind.ASSET_PROCESSING:
      if (!input.ownerUserId || !input.ownerResourceId) {
        throw new Error("MODEL_CONTENT_OWNER_INVALID");
      }
      return;
    case ModelContentOwnerKind.EVALUATION:
    case ModelContentOwnerKind.LEXICON_BUILD:
      if (input.ownerUserId || !input.ownerResourceId) {
        throw new Error("MODEL_CONTENT_OWNER_INVALID");
      }
      return;
    case ModelContentOwnerKind.SYSTEM:
      if (input.ownerUserId) {
        throw new Error("MODEL_CONTENT_OWNER_INVALID");
      }
      return;
    default:
      input.ownerKind satisfies never;
  }
}

function assertContentLifecycleWriter(serviceKey: string): void {
  if (serviceKey !== "agent-api") {
    throw new Error("MODEL_CONTENT_LIFECYCLE_WRITE_FORBIDDEN");
  }
}

function uniqueIds(value: readonly string[]): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 10_000 ||
    value.some(
      (id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  ) {
    throw new Error("MODEL_CONTENT_IDS_INVALID");
  }
  const ids = [...new Set(value)];
  if (ids.length !== value.length)
    throw new Error("MODEL_CONTENT_IDS_DUPLICATE");
  return ids;
}

function assertContentWriter(serviceKey: string): void {
  if (
    ![
      "agent-api",
      "agent-executor",
      "agent-evaluator",
      "asset-processor",
      "lexicon-builder",
    ].includes(serviceKey)
  ) {
    throw new Error("MODEL_CONTENT_WRITE_FORBIDDEN");
  }
}

function assertContentReader(serviceKey: string): void {
  if (!["agent-api", "agent-executor"].includes(serviceKey)) {
    throw new Error("MODEL_CONTENT_READ_FORBIDDEN");
  }
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
