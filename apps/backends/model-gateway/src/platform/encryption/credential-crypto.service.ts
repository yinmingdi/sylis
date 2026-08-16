import { Injectable } from "@nestjs/common";
import {
  createContentCrypto,
  type ContentCrypto,
  type EncryptedEnvelope,
} from "@sylis/content-crypto";

import { ModelGatewayConfig } from "../../config/model-gateway.config";

type DatabaseBytes = Uint8Array<ArrayBuffer>;

export interface StoredCredentialEnvelope {
  id: string;
  profileId: string;
  ciphertext: DatabaseBytes;
  nonce: DatabaseBytes;
  authTag: DatabaseBytes;
  encryptedDek: DatabaseBytes;
  dekNonce: DatabaseBytes;
  dekAuthTag: DatabaseBytes;
  kekVersion: string;
  aadSchemaVersion: string;
}

export interface NewCredentialEnvelope
  extends Omit<StoredCredentialEnvelope, "id" | "profileId"> {
  fingerprint: string;
  fingerprintVersion: string;
  maskedHint: string;
}

@Injectable()
export class CredentialCryptoService {
  private readonly crypto: ContentCrypto;

  constructor(private readonly config: ModelGatewayConfig) {
    this.crypto = createContentCrypto({
      currentVersion: () => config.credentialKekVersion,
      key: (version) => {
        const key = config.credentialKeks[version];
        if (!key) throw new Error(`CREDENTIAL_KEK_NOT_FOUND:${version}`);
        return key;
      },
    });
  }

  async decrypt(
    value: StoredCredentialEnvelope,
    providerKey: string,
  ): Promise<string> {
    const envelope: EncryptedEnvelope = {
      algorithm: "AES-256-GCM",
      ciphertext: Buffer.from(value.ciphertext).toString("base64"),
      nonce: Buffer.from(value.nonce).toString("base64"),
      authTag: Buffer.from(value.authTag).toString("base64"),
      encryptedDek: Buffer.from(value.encryptedDek).toString("base64"),
      dekNonce: Buffer.from(value.dekNonce).toString("base64"),
      dekAuthTag: Buffer.from(value.dekAuthTag).toString("base64"),
      kekVersion: value.kekVersion,
      aadSchemaVersion: value.aadSchemaVersion,
    };
    const plaintext = await this.crypto.decrypt(envelope, {
      ownerKind: "credential-profile",
      ownerId: value.profileId,
      purpose: providerKey,
      recordId: value.id,
      schemaVersion: value.aadSchemaVersion,
    });
    try {
      return Buffer.from(plaintext).toString("utf8");
    } finally {
      plaintext.fill(0);
    }
  }

  async encrypt(input: {
    id: string;
    profileId: string;
    providerKey: string;
    secret: string;
  }): Promise<NewCredentialEnvelope> {
    const schemaVersion = "credential-envelope/1";
    const plaintext = Buffer.from(input.secret, "utf8");
    try {
      const envelope = await this.crypto.encrypt(plaintext, {
        ownerKind: "credential-profile",
        ownerId: input.profileId,
        purpose: input.providerKey,
        recordId: input.id,
        schemaVersion,
      });
      return {
        ciphertext: decodeDatabaseBytes(envelope.ciphertext),
        nonce: decodeDatabaseBytes(envelope.nonce),
        authTag: decodeDatabaseBytes(envelope.authTag),
        encryptedDek: decodeDatabaseBytes(envelope.encryptedDek),
        dekNonce: decodeDatabaseBytes(envelope.dekNonce),
        dekAuthTag: decodeDatabaseBytes(envelope.dekAuthTag),
        kekVersion: envelope.kekVersion,
        aadSchemaVersion: envelope.aadSchemaVersion,
        fingerprint: this.crypto.fingerprint(
          input.secret,
          this.config.credentialFingerprintKey,
        ),
        fingerprintVersion: "hmac-sha256/1",
        maskedHint: `****${input.secret.slice(-4)}`,
      };
    } finally {
      plaintext.fill(0);
    }
  }
}

function decodeDatabaseBytes(value: string): DatabaseBytes {
  return Uint8Array.from(Buffer.from(value, "base64"));
}
