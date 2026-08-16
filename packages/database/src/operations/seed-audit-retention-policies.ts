import { createHash } from "node:crypto";

import {
  SecurityAuditCategory,
  type SylisDatabase,
} from "../client/prisma-client";

export const DefaultAuditRetentionPolicyVersion = "audit-retention/v0.0.1";

export async function seedAuditRetentionPolicies(
  database: SylisDatabase,
  createdByUserId: string,
  effectiveAt: Date,
): Promise<void> {
  await database.auditRetentionPolicy.createMany({
    data: Object.values(SecurityAuditCategory).map((category) => {
      const userSupport = category === SecurityAuditCategory.USER_SUPPORT;
      return {
        id: deterministicId(
          `audit-retention:${category}:${DefaultAuditRetentionPolicyVersion}`,
        ),
        category,
        onlineDays: userSupport ? 365 : 730,
        archiveDays: userSupport ? 365 : 1825,
        policyVersion: DefaultAuditRetentionPolicyVersion,
        effectiveAt,
        createdByUserId,
        actionDigest: digest(
          `audit-retention:${category}:${DefaultAuditRetentionPolicyVersion}`,
        ),
      };
    }),
    skipDuplicates: true,
  });
}

function deterministicId(value: string): string {
  const hex = digest(value).slice("sha256:".length, "sha256:".length + 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
