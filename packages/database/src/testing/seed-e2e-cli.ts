import type { OperatorRole as OperatorRoleValue } from "@prisma/client";

import { seedAgentRuntimeFixtures } from "./seed-agent-runtime";
import { seedE2eLexicon } from "./seed-e2e-lexicon";
import {
  seedE2eOperator,
  type SeedE2eOperatorResult,
} from "./seed-e2e-operator";
import { OperatorRole, createPrismaClient } from "../client/prisma-client";

async function main(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const credentialKek = key("E2E_CREDENTIAL_KEK_BASE64");
  const credentialFingerprintKey = key("E2E_CREDENTIAL_FINGERPRINT_KEY_BASE64");
  const database = createPrismaClient({ url: databaseUrl, log: ["error"] });
  await database.$connect();
  try {
    const lexicon = await seedE2eLexicon({
      database,
      headwordSetPath: required("E2E_HEADWORD_SET_PATH"),
    });
    const operators: SeedE2eOperatorResult[] = [];
    for (const [index, fixture] of operatorFixtures().entries()) {
      operators.push(
        await seedE2eOperator({
          database,
          email: fixture.email,
          password: fixture.password,
          totpSecret: fixture.totpSecret,
          contentEncryptionKey: key("E2E_CONTENT_KEY_BASE64"),
          contentEncryptionKeyVersion: "e2e",
          displayName:
            index === 0
              ? "Sylis E2E Operator"
              : `Sylis E2E Operator ${index + 1}`,
          bootstrap: index === 0,
          grantedByUserId:
            index === 0 ? undefined : operators[0]!.operatorUserId,
        }),
      );
    }
    const operator = operators[0]!;
    const roleOperators: SeedE2eOperatorResult[] = [];
    for (const fixture of roleOperatorFixtures()) {
      roleOperators.push(
        await seedE2eOperator({
          database,
          email: fixture.email,
          password: fixture.password,
          totpSecret: fixture.totpSecret,
          contentEncryptionKey: key("E2E_CONTENT_KEY_BASE64"),
          contentEncryptionKeyVersion: "e2e",
          roles: [fixture.role],
          displayName: `Sylis E2E ${fixture.role}`,
          bootstrap: false,
          grantedByUserId: operator.operatorUserId,
        }),
      );
    }
    const agent = await seedAgentRuntimeFixtures({
      database,
      credentialKek,
      credentialKekVersion: "e2e",
      credentialFingerprintKey,
      contentEncryptionKey: key("E2E_CONTENT_KEY_BASE64"),
      contentEncryptionKeyVersion: "e2e",
    });
    process.stdout.write(
      `${JSON.stringify({ seeded: true, lexicon, operator, operators, roleOperators, agent })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

interface RoleOperatorFixture {
  email: string;
  password: string;
  totpSecret: string;
  role: OperatorRoleValue;
}

type OperatorFixture = Omit<RoleOperatorFixture, "role">;

function operatorFixtures(): OperatorFixture[] {
  const value = JSON.parse(required("E2E_OPERATORS_JSON")) as unknown;
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error("E2E_OPERATORS_INVALID");
  }
  return value.map((item) => parseOperatorFixture(item));
}

function roleOperatorFixtures(): RoleOperatorFixture[] {
  const value = JSON.parse(required("E2E_ROLE_OPERATORS_JSON")) as unknown;
  if (
    !Array.isArray(value) ||
    value.length !== Object.values(OperatorRole).length
  ) {
    throw new Error("E2E_ROLE_OPERATORS_INVALID");
  }
  return value.map((item) => {
    const operator = parseOperatorFixture(item);
    if (
      typeof item !== "object" ||
      item === null ||
      !("role" in item) ||
      !Object.values(OperatorRole).includes(item.role as OperatorRoleValue)
    ) {
      throw new Error("E2E_ROLE_OPERATOR_INVALID");
    }
    return {
      ...operator,
      role: item.role as OperatorRoleValue,
    };
  });
}

function parseOperatorFixture(value: unknown): OperatorFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    !("email" in value) ||
    typeof value.email !== "string" ||
    !("password" in value) ||
    typeof value.password !== "string" ||
    !("totpSecret" in value) ||
    typeof value.totpSecret !== "string"
  ) {
    throw new Error("E2E_OPERATOR_INVALID");
  }
  return {
    email: value.email,
    password: value.password,
    totpSecret: value.totpSecret,
  };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`E2E_SEED_CONFIG_REQUIRED:${name}`);
  return value;
}

function key(name: string): Uint8Array {
  const value = Buffer.from(required(name), "base64");
  if (value.byteLength !== 32) throw new Error(`E2E_SEED_KEY_INVALID:${name}`);
  return value;
}

void main();
