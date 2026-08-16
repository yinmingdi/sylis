import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const invariants = readFileSync(
  resolve(packageRoot, "prisma/invariants.sql"),
  "utf8",
);
const schema = readFileSync(
  resolve(packageRoot, "prisma/schema/agent.prisma"),
  "utf8",
);
const ownerCommands = readFileSync(
  resolve(
    packageRoot,
    "../../apps/backends/api/src/modules/agent-operations/agent-operations.service.ts",
  ),
  "utf8",
);

describe("agent proposal commit invariants", () => {
  it("binds each proposal to one action-scoped grant and idempotency record", () => {
    expect(schema).toContain("grantId");
    expect(schema).toContain("@@unique([runId, actionDigest])");
    expect(invariants).toContain('"agentProposalId"');
    expect(invariants).toContain("AGENT_PROPOSAL_GRANT_INVALID");
    expect(invariants).toContain("AGENT_PROPOSAL_IDEMPOTENCY_INVALID");
  });

  it("uses the immutable action digest as the owner-command request hash", () => {
    expect(ownerCommands).toContain("const requestHash = input.actionDigest");
    expect(ownerCommands).toContain("agentProposalId: proposalId");
    expect(ownerCommands).toContain("idempotencyRecordId: idempotency.id");
  });

  it("rejects expired, mutated, revoked, or mismatched commits", () => {
    expect(invariants).toContain("AGENT_PROPOSAL_BINDING_IMMUTABLE");
    expect(invariants).toContain("AGENT_PROPOSAL_COMMIT_SHAPE_INVALID");
    expect(invariants).toContain('checked_grant."revokedAt" IS NOT NULL');
    expect(invariants).toContain(
      'checked_grant."actionDigest" IS DISTINCT FROM proposal."actionDigest"',
    );
  });
});
