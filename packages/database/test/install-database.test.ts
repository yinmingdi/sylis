import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DatabaseInstallationStep,
  databaseInstallationArguments,
} from "../src/operations/install-database";

describe("databaseInstallationArguments", () => {
  it("forces Prisma to rebuild the schema without migration history", () => {
    expect(
      databaseInstallationArguments(DatabaseInstallationStep.PUSH_SCHEMA),
    ).toEqual([
      "db",
      "push",
      "--force-reset",
      "--skip-generate",
      "--schema",
      "./prisma/schema",
    ]);
  });

  it("applies only the database features Prisma cannot express", () => {
    expect(
      databaseInstallationArguments(DatabaseInstallationStep.APPLY_INVARIANTS),
    ).toEqual([
      "db",
      "execute",
      "--file",
      "./prisma/invariants.sql",
      "--schema",
      "./prisma/schema",
    ]);
  });

  it("uses Prisma code rather than a seed SQL file for reference data", () => {
    expect(
      databaseInstallationArguments(
        DatabaseInstallationStep.SEED_REFERENCE_DATA,
      ),
    ).toEqual([]);
  });

  it("lets the API validate typed SupportGrant targets without direct purge access", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toMatch(
      /GRANT SELECT, INSERT ON TABLE\s+"SupportGrantReadingDocumentRevisionTarget",\s+"SupportGrantContentAssetRevisionTarget",\s+"SupportGrantCollectedLexicalItemRevisionTarget",\s+"SupportGrantExerciseAttemptTextTarget",\s+"SupportGrantDiagnosticBundleRevisionTarget"\s+TO sylis_api;/,
    );
    expect(invariants).toContain(
      'REVOKE DELETE ON TABLE "SupportGrant" FROM sylis_api;',
    );
  });

  it("purges SupportGrants only through the due-user security definer", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toContain(
      'CREATE FUNCTION "sylis_purge_user_support_grants"(owner_user_id uuid)',
    );
    expect(invariants).toContain(
      'REVOKE ALL ON FUNCTION "sylis_purge_user_support_grants"(uuid) FROM PUBLIC;',
    );
    expect(invariants).toMatch(
      /GRANT EXECUTE ON FUNCTION "sylis_purge_user_support_grants"\(uuid\)\s+TO sylis_api, sylis_agent_api;/,
    );
  });

  it("lets the Agent API verify only the effective Support role columns", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toMatch(
      /GRANT SELECT \("userId", "role", "grantedAt", "revokedAt", "expiresAt"\)\s+ON TABLE "OperatorRoleAssignment" TO sylis_agent_api;/,
    );
  });

  it("lets the Agent API append support reads without selecting audit history", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toMatch(
      /GRANT INSERT ON TABLE "SecurityAuditEvent", "DataAccessAuditEvent"\s+TO sylis_agent_api;/,
    );
    expect(invariants).not.toMatch(
      /GRANT SELECT[^;]*"DataAccessAuditEvent"[^;]*TO sylis_agent_api;/,
    );
  });

  it("selects the SupportGrant trigger identifier without reading invalid record fields", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toMatch(
      /IF TG_TABLE_NAME = 'SupportGrant' THEN\s+checked_grant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD\."id" ELSE NEW\."id" END;\s+ELSE\s+checked_grant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD\."grantId" ELSE NEW\."grantId" END;\s+END IF;/,
    );
  });

  it("selects the pedagogical material trigger identifier without reading invalid record fields", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toMatch(
      /IF TG_TABLE_NAME = 'PedagogicalMaterialRevision' THEN\s+checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD\."id" ELSE NEW\."id" END;\s+ELSE\s+checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD\."materialRevisionId" ELSE NEW\."materialRevisionId" END;\s+END IF;/,
    );
    expect(invariants).not.toMatch(
      /:= CASE\s+WHEN TG_TABLE_NAME = '(CandidateRevision|RightsDecision|AssessmentSelectionRule|LexicalAnnotation|EtymologyLink|PedagogicalMaterialBlock|PedagogicalMaterialMention|ContentProfileEvaluation)'/,
    );
  });

  it("keeps Outbox event content immutable while delivery state advances", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toContain(
      'CREATE FUNCTION "sylis_guard_outbox_event_update"()',
    );
    expect(invariants).toContain('CREATE TRIGGER "OutboxEvent_update_guard"');
    expect(invariants).toContain("OUTBOX_EVENT_BINDING_IMMUTABLE");
    expect(invariants).toContain("OUTBOX_EVENT_DELIVERY_TRANSITION_INVALID");
  });

  it("RELEASE-001-CONTRACT keeps an activation within its owning Lexicon", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toContain(
      'checked_release."lexiconId" <> checked_activation."lexiconId"',
    );
    expect(invariants).toContain(
      'from_release_lexicon_id IS DISTINCT FROM checked_activation."lexiconId"',
    );
  });

  it("checks source restrictions at both release activation boundaries", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toContain(
      'CREATE FUNCTION "sylis_lexicon_release_has_active_source_restriction"(',
    );
    expect(invariants).toContain('restriction."datasetVersionId" IS NULL');
    expect(invariants).toContain('restriction."effectiveAt" <= checked_at');
    expect(invariants).toContain("SOURCE_RESTRICTION_POLICY_VERSION_MISMATCH");
    expect(
      invariants.match(/LEXICON_RELEASE_ACTIVATION_SOURCE_RESTRICTED/g),
    ).toHaveLength(2);
  });

  it("binds a running Agent ToolCall to one immutable JobAttempt fence", () => {
    const invariants = readFileSync(
      new URL("../prisma/invariants.sql", import.meta.url),
      "utf8",
    );

    expect(invariants).toContain(
      "AgentToolCall executor attempt and fencing token must be present together",
    );
    expect(invariants).toContain(
      "queued AgentToolCall cannot have an executor owner",
    );
    expect(invariants).toContain(
      "running AgentToolCall requires an executor owner and startedAt",
    );
    expect(invariants).toContain(
      "AgentToolCall executor ownership is immutable",
    );
  });
});
