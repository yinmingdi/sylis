import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { WorkerConfig } from "../../config/worker-config";

@Injectable()
export class ContentEncryptionService {
  constructor(private readonly config: WorkerConfig) {}

  encrypt(
    value: string,
    purpose: string,
  ): { ciphertext: Uint8Array<ArrayBuffer>; keyVersion: string } {
    const version = this.config.contentEncryptionActiveKeyVersion;
    const key = this.config.contentEncryptionKeys.get(version)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: Uint8Array.from(
        Buffer.concat([iv, cipher.getAuthTag(), ciphertext]),
      ),
      keyVersion: version,
    };
  }

  decrypt(
    envelope: { ciphertext: Uint8Array; keyVersion: string },
    purpose: string,
  ) {
    const key = this.config.contentEncryptionKeys.get(envelope.keyVersion);
    if (!key) throw new Error("CONTENT_ENCRYPTION_KEY_VERSION_UNAVAILABLE");
    const bytes = Buffer.from(envelope.ciphertext);
    if (bytes.length < 29) throw new Error("CONTENT_CIPHERTEXT_INVALID");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }
}
