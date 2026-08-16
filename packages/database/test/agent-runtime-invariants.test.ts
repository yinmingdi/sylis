import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const invariants = readFileSync(
  resolve(packageRoot, "prisma/invariants.sql"),
  "utf8",
);
const agentSchema = readFileSync(
  resolve(packageRoot, "prisma/schema/agent.prisma"),
  "utf8",
);
const modelExecutionSchema = readFileSync(
  resolve(packageRoot, "prisma/schema/model-execution.prisma"),
  "utf8",
);

describe("durable Agent runtime invariant DDL", () => {
  it("binds each ordered Step to one Run and one completed Invocation", () => {
    expect(agentSchema).toContain("model AgentRunStep {");
    expect(agentSchema).toContain("@@unique([runId, ordinal])");
    expect(agentSchema).toContain(
      "modelInvocationId  String             @unique",
    );
    expect(invariants).toContain(
      'CREATE FUNCTION "sylis_guard_agent_run_step"()',
    );
    expect(invariants).toContain(
      "AgentRunStep invocation target must match its AgentRun",
    );
    expect(invariants).toContain(
      "completed AgentRunStep requires a succeeded ModelInvocation",
    );
    expect(invariants).toContain("AgentRunStep status transition is invalid");
    expect(invariants).toContain("terminal AgentRunStep is immutable");
  });

  it("keeps equal-input Tool calls independent and fences every dispatch", () => {
    const toolCall = modelBody(agentSchema, "AgentToolCall");
    expect(toolCall).toContain("stepId");
    expect(toolCall).toContain("modelPosition");
    expect(toolCall).toContain("providerCallId");
    expect(toolCall).toContain("@@unique([stepId, modelPosition])");
    expect(toolCall).toContain("@@unique([stepId, providerCallId])");
    expect(toolCall).not.toContain("@@unique([runId, actionDigest])");
    expect(invariants).toContain(
      'CREATE FUNCTION "sylis_guard_agent_tool_call_v2"()',
    );
    expect(invariants).toContain(
      "AgentToolCall executor attempt and fencing token must be present together",
    );
    expect(invariants).toContain(
      "AgentToolCall executor ownership is immutable",
    );
    expect(invariants).toContain("AgentToolCall status transition is invalid");
    expect(invariants).toContain("terminal AgentToolCall is immutable");
  });

  it("permits another Provider Attempt only before any output or usage is accepted", () => {
    const attempt = modelBody(modelExecutionSchema, "ModelInvocationAttempt");
    for (const field of [
      "acceptedBlockCount",
      "acceptedFragmentCount",
      "acceptedToolCallCount",
      "usageObserved",
    ]) {
      expect(attempt).toContain(field);
    }
    expect(attempt).toContain("@@unique([invocationId, ordinal])");
    expect(invariants).toContain(
      'CREATE TRIGGER "ModelInvocationAttempt_retry_guard"',
    );
    expect(invariants).toContain(
      "ModelInvocationAttempt accepted-output counters cannot decrease",
    );
    expect(invariants).toContain(
      "only a failed attempt without accepted output may have a successor",
    );
    expect(invariants).toContain(
      "ModelInvocationAttempt retry reason requires a retry-safe failure",
    );
    expect(invariants).toContain(
      "terminal ModelInvocationAttempt is immutable",
    );
    expect(invariants).toContain(
      'SELECT 1 FROM "AgentRunStep"\n      WHERE "modelInvocationId" = NEW."invocationId"',
    );
  });

  it("enforces typed, bounded, immutable MessageBlock trees and fragment identity", () => {
    expect(agentSchema).toContain("model AgentMessageBlock {");
    expect(agentSchema).toContain("model AgentMessageBlockContent {");
    expect(agentSchema).toContain("model AgentMessageBlockReference {");
    expect(agentSchema).toContain(
      "@@unique([stepId, modelPosition, modelSubPosition])",
    );
    expect(modelExecutionSchema).toContain(
      "@@unique([invocationId, modelPosition, modelSubPosition, fragmentSequence])",
    );
    expect(invariants).toContain(
      'CREATE FUNCTION "sylis_guard_model_content_fragment_mutation"()',
    );
    expect(invariants).toContain("NEW.\"kekVersion\" <> 'purged'");
    expect(invariants).toContain(
      'CREATE TRIGGER "AgentMessageBlock_tree_guard"',
    );
    expect(invariants).toContain(
      "AgentMessageBlock requires exactly one typed child",
    );
    expect(invariants).toContain(
      "AgentMessageBlock tree is cyclic or too deep",
    );
    expect(invariants).toContain("AgentMessageBlock count exceeds limit");
    expect(invariants).toContain(
      "sealed or interrupted AgentMessageBlock payload is immutable",
    );
    expect(invariants).toContain(
      "AgentMessageBlock status transition is invalid",
    );
    expect(invariants).toContain("AgentMessageBlock identity is immutable");
  });
});

function modelBody(schema: string, name: string): string {
  const match = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, "u").exec(
    schema,
  );
  if (!match?.[1])
    throw new Error(`PRISMA_MODEL_${name.toUpperCase()}_MISSING`);
  return match[1];
}
