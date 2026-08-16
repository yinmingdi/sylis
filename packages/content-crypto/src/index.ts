import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

export interface EncryptionContext {
  ownerKind: string;
  ownerId: string;
  purpose: string;
  recordId: string;
  schemaVersion: string;
}

export interface EncryptedEnvelope {
  algorithm: "AES-256-GCM";
  ciphertext: string;
  nonce: string;
  authTag: string;
  encryptedDek: string;
  dekNonce: string;
  dekAuthTag: string;
  kekVersion: string;
  aadSchemaVersion: string;
}

export interface KeyProvider {
  currentVersion(): string;
  key(version: string): Promise<Uint8Array> | Uint8Array;
}

export interface ContentCrypto {
  encrypt(
    plaintext: Uint8Array,
    context: EncryptionContext,
  ): Promise<EncryptedEnvelope>;
  decrypt(
    envelope: EncryptedEnvelope,
    context: EncryptionContext,
  ): Promise<Uint8Array>;
  rewrap(
    envelope: EncryptedEnvelope,
    context: EncryptionContext,
    targetKekVersion?: string,
  ): Promise<EncryptedEnvelope>;
  fingerprint(secret: string, indexKey: Uint8Array): string;
  redact(value: string): string;
}

export function createContentCrypto(keys: KeyProvider): ContentCrypto {
  return {
    async encrypt(plaintext, context) {
      const dek = randomBytes(32);
      const aad = encodeContext(context);
      const body = encryptAesGcm(Buffer.from(plaintext), dek, aad);
      const kekVersion = keys.currentVersion();
      const kek = normalizedKey(await keys.key(kekVersion));
      const wrapped = encryptAesGcm(dek, kek, aad);
      dek.fill(0);
      return {
        algorithm: "AES-256-GCM",
        ciphertext: body.ciphertext.toString("base64"),
        nonce: body.nonce.toString("base64"),
        authTag: body.authTag.toString("base64"),
        encryptedDek: wrapped.ciphertext.toString("base64"),
        dekNonce: wrapped.nonce.toString("base64"),
        dekAuthTag: wrapped.authTag.toString("base64"),
        kekVersion,
        aadSchemaVersion: context.schemaVersion,
      };
    },

    async decrypt(envelope, context) {
      assertEnvelope(envelope, context);
      const aad = encodeContext(context);
      const kek = normalizedKey(await keys.key(envelope.kekVersion));
      const dek = decryptAesGcm(
        Buffer.from(envelope.encryptedDek, "base64"),
        kek,
        Buffer.from(envelope.dekNonce, "base64"),
        Buffer.from(envelope.dekAuthTag, "base64"),
        aad,
      );
      try {
        return decryptAesGcm(
          Buffer.from(envelope.ciphertext, "base64"),
          dek,
          Buffer.from(envelope.nonce, "base64"),
          Buffer.from(envelope.authTag, "base64"),
          aad,
        );
      } finally {
        dek.fill(0);
      }
    },

    async rewrap(envelope, context, requestedVersion) {
      assertEnvelope(envelope, context);
      const aad = encodeContext(context);
      const oldKek = normalizedKey(await keys.key(envelope.kekVersion));
      const dek = decryptAesGcm(
        Buffer.from(envelope.encryptedDek, "base64"),
        oldKek,
        Buffer.from(envelope.dekNonce, "base64"),
        Buffer.from(envelope.dekAuthTag, "base64"),
        aad,
      );
      try {
        const kekVersion = requestedVersion ?? keys.currentVersion();
        const newKek = normalizedKey(await keys.key(kekVersion));
        const wrapped = encryptAesGcm(dek, newKek, aad);
        return {
          ...envelope,
          encryptedDek: wrapped.ciphertext.toString("base64"),
          dekNonce: wrapped.nonce.toString("base64"),
          dekAuthTag: wrapped.authTag.toString("base64"),
          kekVersion,
        };
      } finally {
        dek.fill(0);
      }
    },

    fingerprint(secret, indexKey) {
      return `hmac-sha256:${createHmac("sha256", normalizedKey(indexKey))
        .update(secret.normalize("NFKC"))
        .digest("hex")}`;
    },

    redact(value) {
      return value
        .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
        .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
        .replace(
          /(authorization|api[-_ ]?key|password|secret)\s*[:=]\s*[^\s,;]+/gi,
          "$1=[REDACTED]",
        );
    },
  };
}

function encodeContext(context: EncryptionContext): Buffer {
  return Buffer.from(
    JSON.stringify([
      context.schemaVersion,
      context.ownerKind,
      context.ownerId,
      context.purpose,
      context.recordId,
    ]),
  );
}

function normalizedKey(value: Uint8Array): Buffer {
  const key = Buffer.from(value);
  if (key.byteLength !== 32) throw new Error("CONTENT_CRYPTO_KEY_LENGTH");
  return key;
}

function encryptAesGcm(plaintext: Buffer, key: Buffer, aad: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag() };
}

function decryptAesGcm(
  ciphertext: Buffer,
  key: Buffer,
  nonce: Buffer,
  authTag: Buffer,
  aad: Buffer,
): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function assertEnvelope(
  envelope: EncryptedEnvelope,
  context: EncryptionContext,
): void {
  if (envelope.algorithm !== "AES-256-GCM") {
    throw new Error("CONTENT_CRYPTO_ALGORITHM");
  }
  if (envelope.aadSchemaVersion !== context.schemaVersion) {
    throw new Error("CONTENT_CRYPTO_AAD_SCHEMA");
  }
}
