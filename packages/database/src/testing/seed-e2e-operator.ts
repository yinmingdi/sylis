import type { OperatorRole as OperatorRoleValue } from "@prisma/client";

import { OperatorRole } from "../client/prisma-client";
import type { SylisDatabase } from "../client/prisma-client";
import { seedAuditRetentionPolicies } from "../operations/seed-audit-retention-policies";
import { seedCredentialedAccount } from "../operations/seed-credentialed-account";

const FIXTURE_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

export interface SeedE2eOperatorInput {
  database: SylisDatabase;
  email: string;
  password: string;
  totpSecret: string;
  contentEncryptionKey: Uint8Array;
  contentEncryptionKeyVersion: string;
  roles?: readonly OperatorRoleValue[];
  displayName?: string;
  bootstrap?: boolean;
  grantedByUserId?: string;
}

export interface SeedE2eOperatorResult {
  operatorUserId: string;
  roles: OperatorRoleValue[];
}

export async function seedE2eOperator(
  input: SeedE2eOperatorInput,
): Promise<SeedE2eOperatorResult> {
  const roles = [...(input.roles ?? Object.values(OperatorRole))];
  const result = await seedCredentialedAccount({
    database: input.database,
    namespace: "e2e-operator",
    email: input.email,
    password: input.password,
    displayName: input.displayName ?? "Sylis E2E Operator",
    roles,
    totp: {
      secret: input.totpSecret,
      contentEncryptionKey: input.contentEncryptionKey,
      contentEncryptionKeyVersion: input.contentEncryptionKeyVersion,
    },
    bootstrap:
      (input.bootstrap ?? true)
        ? {
            policyVersion: "e2e-lexicon-activation/1",
            requiredRole: OperatorRole.RELEASE_MANAGER,
          }
        : undefined,
    operatorGrant:
      input.bootstrap === false && input.grantedByUserId
        ? {
            grantedByUserId: input.grantedByUserId,
            policyVersion: "e2e-operator-grant/1",
            expiresAt: new Date(
              FIXTURE_TIMESTAMP.getTime() + 365 * 24 * 60 * 60_000,
            ),
          }
        : undefined,
    createdAt: FIXTURE_TIMESTAMP,
  });
  await seedAuditRetentionPolicies(
    input.database,
    result.userId,
    FIXTURE_TIMESTAMP,
  );
  return { operatorUserId: result.userId, roles: result.roles };
}
