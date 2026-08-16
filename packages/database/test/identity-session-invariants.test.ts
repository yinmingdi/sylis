import { createHash, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describeDatabase("identity session invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("only accepts USER and MFA-authenticated ADMIN browser sessions", async () => {
    const userId = await createUser("audience");

    await expect(insertSession(userId, "USER", "PASSWORD")).resolves.toBe(1);
    await expect(
      insertSession(userId, "ADMIN", "PASSWORD_MFA", { mfa: true }),
    ).resolves.toBe(1);
    await expect(insertSession(userId, "AGENT", "PASSWORD")).rejects.toThrow(
      /AuthSession_secure_shape_check/,
    );
    await expect(insertSession(userId, "SERVICE", "PASSWORD")).rejects.toThrow(
      /AuthSession_secure_shape_check/,
    );
    await expect(insertSession(userId, "ADMIN", "PASSWORD")).rejects.toThrow(
      /AuthSession_secure_shape_check/,
    );
  });

  it("keeps the session principal, audience and hard expiry immutable", async () => {
    const userId = await createUser("binding");
    const sessionId = await createSession(userId);

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "AuthSession"
         SET "audience" = 'ADMIN',
             "authStrength" = 'PASSWORD_MFA',
             "mfaAuthenticatedAt" = now()
         WHERE "id" = $1::uuid`,
        sessionId,
      ),
    ).rejects.toThrow(/AUTH_SESSION_BINDING_IMMUTABLE/);

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "AuthSession"
         SET "expiresAt" = "expiresAt" + interval '1 hour'
         WHERE "id" = $1::uuid`,
        sessionId,
      ),
    ).rejects.toThrow(/AUTH_SESSION_BINDING_IMMUTABLE/);
  });

  it("never restores a revoked session", async () => {
    const userId = await createUser("revoked");
    const sessionId = await createSession(userId);
    await database!.$executeRawUnsafe(
      `UPDATE "AuthSession"
       SET "revokedAt" = now(), "revokeReason" = 'USER_REVOKED'
       WHERE "id" = $1::uuid`,
      sessionId,
    );

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "AuthSession"
         SET "revokedAt" = NULL, "revokeReason" = NULL
         WHERE "id" = $1::uuid`,
        sessionId,
      ),
    ).rejects.toThrow(/AUTH_SESSION_REVOKED_IMMUTABLE/);
  });

  it("never extends an idle-expired session", async () => {
    const userId = await createUser("expired");
    const sessionId = randomUUID();
    const createdAt = new Date(Date.now() - 2 * 60 * 60_000);
    const lastSeenAt = new Date(createdAt.getTime() + 15 * 60_000);
    const idleExpiresAt = new Date(createdAt.getTime() + 30 * 60_000);
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await insertSession(userId, "USER", "PASSWORD", {
      sessionId,
      createdAt,
      lastSeenAt,
      idleExpiresAt,
      expiresAt,
    });

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "AuthSession"
         SET "lastSeenAt" = now(), "idleExpiresAt" = now() + interval '30 minutes'
         WHERE "id" = $1::uuid`,
        sessionId,
      ),
    ).rejects.toThrow(/AUTH_SESSION_EXPIRED_IMMUTABLE/);

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "AuthSession"
         SET "revokedAt" = now(), "revokeReason" = 'USER_REVOKED'
         WHERE "id" = $1::uuid`,
        sessionId,
      ),
    ).resolves.toBe(1);
  });

  it("allows a still-active session to advance its idle window", async () => {
    const userId = await createUser("heartbeat");
    const sessionId = await createSession(userId);

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "AuthSession"
         SET "lastSeenAt" = now(), "idleExpiresAt" = now() + interval '90 minutes'
         WHERE "id" = $1::uuid`,
        sessionId,
      ),
    ).resolves.toBe(1);
  });

  it("only grants the API database role mutation access to AuthSession", async () => {
    const privileges = await database!.$queryRawUnsafe<
      Array<{ roleName: string; mayMutate: boolean }>
    >(
      `SELECT role_name AS "roleName",
              (
                has_table_privilege(role_name, '"AuthSession"', 'INSERT')
                OR has_table_privilege(role_name, '"AuthSession"', 'UPDATE')
                OR has_table_privilege(role_name, '"AuthSession"', 'DELETE')
              ) AS "mayMutate"
       FROM unnest(ARRAY[
         'sylis_admin_api',
         'sylis_agent_api',
         'sylis_model_gateway',
         'sylis_agent_executor',
         'sylis_agent_evaluator',
         'sylis_asset_processor',
         'sylis_automation_executor',
         'sylis_lexicon_builder',
         'sylis_lexicon_publisher'
       ]) AS roles(role_name)`,
    );

    expect(privileges).toHaveLength(9);
    expect(privileges.every((privilege) => !privilege.mayMutate)).toBe(true);
  });
});

async function createUser(label: string): Promise<string> {
  const id = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "displayName") VALUES ($1::uuid, $2)`,
    id,
    `Session invariant ${label}`,
  );
  return id;
}

async function createSession(userId: string): Promise<string> {
  const sessionId = randomUUID();
  await insertSession(userId, "USER", "PASSWORD", { sessionId });
  return sessionId;
}

async function insertSession(
  userId: string,
  audience: "USER" | "ADMIN" | "AGENT" | "SERVICE",
  authStrength: "PASSWORD" | "PASSWORD_MFA",
  input: {
    createdAt?: Date;
    expiresAt?: Date;
    idleExpiresAt?: Date;
    lastSeenAt?: Date;
    mfa?: boolean;
    sessionId?: string;
  } = {},
): Promise<number> {
  const createdAt = input.createdAt ?? new Date();
  const lastSeenAt = input.lastSeenAt ?? createdAt;
  const idleExpiresAt =
    input.idleExpiresAt ?? new Date(createdAt.getTime() + 60 * 60_000);
  const expiresAt =
    input.expiresAt ?? new Date(createdAt.getTime() + 2 * 60 * 60_000);
  return database!.$executeRawUnsafe(
    `INSERT INTO "AuthSession" (
       "id", "userId", "audience", "tokenHash", "csrfTokenHash",
       "authStrength", "securityVersion", "mfaAuthenticatedAt",
       "reAuthenticatedAt", "createdAt", "lastSeenAt", "idleExpiresAt",
       "expiresAt"
     ) VALUES (
       $1::uuid, $2::uuid, $3::"SessionAudience", $4, $5,
       $6::"SessionAuthStrength", 0, $7::timestamptz,
       $8::timestamptz, $8::timestamptz, $9::timestamptz,
       $10::timestamptz, $11::timestamptz
     )`,
    input.sessionId ?? randomUUID(),
    userId,
    audience,
    digest(randomUUID()),
    digest(randomUUID()),
    authStrength,
    input.mfa ? createdAt : null,
    createdAt,
    lastSeenAt,
    idleExpiresAt,
    expiresAt,
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
