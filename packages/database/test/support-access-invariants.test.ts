import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../prisma/schema/schema.prisma", import.meta.url),
  "utf8",
);
const invariants = readFileSync(
  new URL("../prisma/invariants.sql", import.meta.url),
  "utf8",
);

const SUPPORT_RESOURCE_ALLOWLIST = [
  "READING_DOCUMENT_REVISION",
  "CONTENT_ASSET_REVISION",
  "COLLECTED_LEXICAL_ITEM_REVISION",
  "EXERCISE_ATTEMPT_TEXT_ARTIFACT",
  "DIAGNOSTIC_BUNDLE_REVISION",
] as const;

describe("support access invariants", () => {
  it("keeps the support resource enum limited to the five private-resource projections", () => {
    const enumBody = schema.match(
      /enum SupportResourceKind \{([\s\S]*?)\}/,
    )?.[1];
    expect(enumBody).toBeDefined();
    expect(
      enumBody!
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ).toEqual(SUPPORT_RESOURCE_ALLOWLIST);
    for (const forbiddenKind of [
      "AGENT_SESSION",
      "MODEL_EXCHANGE",
      "CREDENTIAL",
      "HIDDEN_REASONING",
      "SYSTEM_PROMPT",
      "PROVIDER_RAW_BODY",
    ]) {
      expect(enumBody).not.toContain(forbiddenKind);
    }
  });

  it("requires grant and audit rows to remain inside the explicit allowlist", () => {
    for (const constraint of [
      "SupportGrant_resource_allowlist_check",
      "DataAccessAuditEvent_resource_allowlist_check",
    ]) {
      const body = invariants.match(
        new RegExp(`${constraint}\\"[\\s\\S]*?\\);`),
      )?.[0];
      expect(body).toBeDefined();
      for (const kind of SUPPORT_RESOURCE_ALLOWLIST)
        expect(body).toContain(kind);
    }
  });

  it("binds every audit fact to the exact grant and live authorization", () => {
    expect(invariants).toContain(
      'CREATE FUNCTION "sylis_assert_data_access_audit_binding"()',
    );
    expect(invariants).toContain("DATA_ACCESS_AUDIT_GRANT_BINDING_INVALID");
    expect(invariants).toContain("DATA_ACCESS_AUDIT_AUTHORIZATION_INVALID");
    expect(invariants).toMatch(
      /CREATE CONSTRAINT TRIGGER "DataAccessAuditEvent_grant_binding_guard"\s+AFTER INSERT ON "DataAccessAuditEvent"\s+DEFERRABLE INITIALLY DEFERRED/,
    );
    expect(invariants).toMatch(
      /GRANT SELECT \("userId", "role", "grantedAt", "revokedAt", "expiresAt"\)\s+ON TABLE "OperatorRoleAssignment" TO sylis_agent_api;/,
    );
  });
});
