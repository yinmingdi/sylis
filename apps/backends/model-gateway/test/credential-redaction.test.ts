import { CredentialStatus, CredentialType } from "@sylis/database";
import { describe, expect, it } from "vitest";

import { publicRevision } from "../src/modules/admin/admin-model.service";

describe("credential response redaction", () => {
  it("IDENTITY-005-UNIT constructs a public whitelist without credential secrets", () => {
    const stored = {
      id: "revision-id",
      profileId: "profile-id",
      revisionNo: 1,
      credentialType: CredentialType.API_KEY,
      status: CredentialStatus.VERIFIED,
      fingerprintVersion: "v1",
      maskedHint: "...abcd",
      metadata: { account: "fixture" },
      validatedAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      kekVersion: "v1",
      ciphertext: Buffer.from("secret"),
      nonce: Buffer.alloc(12),
      authTag: Buffer.alloc(16),
      encryptedDek: Buffer.alloc(32),
      dekNonce: Buffer.alloc(12),
      dekAuthTag: Buffer.alloc(16),
      fingerprint: "private-fingerprint",
    };

    const result = publicRevision(stored);

    expect(result).toEqual({
      id: "revision-id",
      profileId: "profile-id",
      revisionNo: 1,
      credentialType: CredentialType.API_KEY,
      status: CredentialStatus.VERIFIED,
      fingerprintVersion: "v1",
      maskedHint: "...abcd",
      metadata: { account: "fixture" },
      validatedAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      kekVersion: "v1",
    });
    expect(Object.keys(result)).not.toContain("ciphertext");
    expect(JSON.stringify(result)).not.toContain("private-fingerprint");
  });
});
