import { createHash, randomUUID } from "node:crypto";

import { hash as argon2Hash } from "argon2";
import { afterAll, describe, expect, it } from "vitest";

import {
  createPrismaClient,
  PasswordHashAlgorithm,
} from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describeDatabase("identity secure-storage invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("accepts Argon2id PHC password verifiers and rejects plaintext", async () => {
    const userId = await createUser("password");
    const verifier = await argon2Hash("test-only-password", { type: 2 });
    await expect(
      database!.passwordCredential.create({
        data: {
          userId,
          hash: verifier,
          algorithm: PasswordHashAlgorithm.ARGON2ID,
          parameters: { encoding: "PHC" },
        },
      }),
    ).resolves.toMatchObject({ userId });

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "PasswordCredential" (
           "id", "userId", "hash", "algorithm", "parameters"
         ) VALUES (
           $1::uuid, $2::uuid, 'plaintext-password', 'ARGON2ID',
           '{"encoding":"PHC"}'::jsonb
         )`,
        randomUUID(),
        userId,
      ),
    ).rejects.toThrow(/PasswordCredential_secure_storage_check/);
  });

  it("rejects malformed verification and authentication challenge hashes", async () => {
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "VerificationChallenge" (
           "id", "purpose", "destinationHash", "codeHash", "expiresAt"
         ) VALUES (
           $1::uuid, 'REGISTRATION', 'email@example.test', 'raw-token',
           now() + interval '15 minutes'
         )`,
        randomUUID(),
      ),
    ).rejects.toThrow(/VerificationChallenge_secure_shape_check/);

    const userId = await createUser("challenge");
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "AuthenticationChallenge" (
           "id", "userId", "audience", "purpose", "deviceNonceHash",
           "allowedMfaKinds", "expiresAt"
         ) VALUES (
           $1::uuid, $2::uuid, 'ADMIN', 'ADMIN_LOGIN', 'raw-nonce',
           ARRAY['TOTP']::"MfaCredentialKind"[], now() + interval '5 minutes'
         )`,
        randomUUID(),
        userId,
      ),
    ).rejects.toThrow(/AuthenticationChallenge_secure_shape_check/);
  });

  it("rejects empty WebAuthn keys, short TOTP ciphertext and weak recovery hashes", async () => {
    const userId = await createUser("mfa");
    await expect(
      database!.$transaction(async (transaction) => {
        const mfaCredentialId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "MfaCredential" (
             "id", "userId", "kind", "label"
           ) VALUES ($1::uuid, $2::uuid, 'WEBAUTHN', 'Invariant WebAuthn')`,
          mfaCredentialId,
          userId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "WebAuthnCredential" (
             "mfaCredentialId", "credentialId", "publicKey"
           ) VALUES ($1::uuid, decode('', 'hex'), decode('', 'hex'))`,
          mfaCredentialId,
        );
      }),
    ).rejects.toThrow(/WebAuthnCredential_secure_shape_check/);
    await expect(
      database!.$transaction(async (transaction) => {
        const mfaCredentialId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "MfaCredential" (
             "id", "userId", "kind", "label"
           ) VALUES ($1::uuid, $2::uuid, 'TOTP', 'Invariant TOTP')`,
          mfaCredentialId,
          userId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "TotpCredential" (
             "mfaCredentialId", "secretCiphertext", "keyVersion"
           ) VALUES ($1::uuid, decode('00', 'hex'), 'test-key')`,
          mfaCredentialId,
        );
      }),
    ).rejects.toThrow(/TotpCredential_secure_storage_check/);

    const mfaCredentialId = randomUUID();
    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "MfaCredential" (
           "id", "userId", "kind", "label"
         ) VALUES ($1::uuid, $2::uuid, 'TOTP', 'Invariant recovery code')`,
        mfaCredentialId,
        userId,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "TotpCredential" (
           "mfaCredentialId", "secretCiphertext", "keyVersion"
         ) VALUES ($1::uuid, decode(repeat('01', 32), 'hex'), 'test-key')`,
        mfaCredentialId,
      );
    });
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "MfaRecoveryCode" (
           "id", "mfaCredentialId", "codeHash"
         ) VALUES ($1::uuid, $2::uuid, 'sha256-is-too-fast')`,
        randomUUID(),
        mfaCredentialId,
      ),
    ).rejects.toThrow(/MfaRecoveryCode_secure_storage_check/);
  });

  it("accepts canonical session hashes and rejects raw bearer tokens", async () => {
    const userId = await createUser("session");
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "AuthSession" (
           "id", "userId", "audience", "tokenHash", "csrfTokenHash",
           "authStrength", "securityVersion", "createdAt", "lastSeenAt",
           "reAuthenticatedAt", "idleExpiresAt", "expiresAt"
         ) VALUES (
           $1::uuid, $2::uuid, 'USER', $3, $4, 'PASSWORD', 0,
           $5::timestamptz, $5::timestamptz, $5::timestamptz,
           $5::timestamptz + interval '30 minutes',
           $5::timestamptz + interval '1 hour'
         )`,
        randomUUID(),
        userId,
        digest(randomUUID()),
        digest(randomUUID()),
        new Date(),
      ),
    ).resolves.toBe(1);

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "AuthSession" (
           "id", "userId", "audience", "tokenHash", "csrfTokenHash",
           "authStrength", "securityVersion", "idleExpiresAt", "expiresAt"
         ) VALUES (
           $1::uuid, $2::uuid, 'USER', 'raw-bearer-token', $3,
           'PASSWORD', 0, now() + interval '30 minutes', now() + interval '1 hour'
         )`,
        randomUUID(),
        userId,
        digest(randomUUID()),
      ),
    ).rejects.toThrow(/AuthSession_secure_shape_check/);
  });
});

async function createUser(label: string): Promise<string> {
  const id = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "displayName") VALUES ($1::uuid, $2)`,
    id,
    `Identity invariant ${label}`,
  );
  return id;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
