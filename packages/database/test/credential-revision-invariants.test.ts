import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const schema = readFileSync(
  resolve(packageRoot, "prisma/schema/model-execution.prisma"),
  "utf8",
);
const invariants = readFileSync(
  resolve(packageRoot, "prisma/invariants.sql"),
  "utf8",
);

describe("credential revision invariants", () => {
  it("pins the current revision to the same credential profile", () => {
    expect(schema).toContain("fields: [id, currentRevisionId]");
    expect(schema).toContain("references: [profileId, id]");
    expect(schema).toContain("@@unique([profileId, id])");
    expect(invariants).toContain("CREDENTIAL_CURRENT_REVISION_INVALID");
  });

  it("freezes credential material outside the retention cryptoshred path", () => {
    expect(invariants).toContain(
      'CREATE TRIGGER "CredentialRevision_update_guard"',
    );
    expect(invariants).toContain("CREDENTIAL_REVISION_BINDING_IMMUTABLE");
    expect(invariants).toContain("CREDENTIAL_REVISION_CONTENT_IMMUTABLE");
    expect(invariants).toContain("CREDENTIAL_REVISION_DELETE_FORBIDDEN");
    expect(invariants).toContain("NEW.\"kekVersion\" = 'purged'");
  });

  it("rejects permit issuance from non-current or revoked credentials", () => {
    expect(invariants).toContain(
      'CREATE TRIGGER "ModelExecutionPermit_credential_insert_guard"',
    );
    expect(invariants).toContain("MODEL_PERMIT_CREDENTIAL_INVALID");
    expect(invariants).toContain("CREDENTIAL_REVOCATION_HAS_ISSUED_PERMIT");
  });
});
