import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const invariants = readFileSync(
  resolve(packageRoot, "prisma/invariants.sql"),
  "utf8",
);
const agentDomain = readFileSync(
  resolve(
    packageRoot,
    "../../apps/backends/agent-api/src/modules/agent/agent-domain.service.ts",
  ),
  "utf8",
);
const jobStore = readFileSync(
  resolve(packageRoot, "../job-runtime/src/prisma-store.ts"),
  "utf8",
);

describe("agent wait invariants", () => {
  it("enforces one active wait and a quiescent activation job", () => {
    expect(invariants).toContain(
      'CREATE UNIQUE INDEX "AgentWaitCondition_one_active_per_run_key"',
    );
    expect(invariants).toContain(
      'CREATE CONSTRAINT TRIGGER "AgentRun_wait_state_guard"',
    );
    expect(invariants).toContain("AGENT_WAITING_ACTIVE_CONDITION_INVALID");
    expect(invariants).toContain("AGENT_WAITING_ACTIVATION_JOB_INVALID");
  });

  it("requires every wait resume to supersede a terminal activation job", () => {
    expect(invariants).toContain('CREATE TRIGGER "AgentRun_wait_resume_guard"');
    expect(invariants).toContain("AGENT_WAIT_RESUME_JOB_INVALID");
    expect(agentDomain).toContain("AGENT_RESUME_PREVIOUS_JOB_REQUIRED");
    expect(agentDomain).toContain("supersedesJobId: supersededJob.id");
  });

  it("settles the run only after the current job reaches a terminal state", () => {
    expect(jobStore).toContain(
      "transitionAgentRunToWaiting(transaction, job, now)",
    );
    expect(jobStore).toContain("AGENT_ACTIVE_WAIT_COUNT_INVALID");
    expect(jobStore).toContain("parent.status = 'WAITING'");
  });

  it("uses one batch wait for all child runs", () => {
    expect(agentDomain).toContain(
      "const waitId = stableUuid(`${action.actionId}:child-wait`)",
    );
    expect(agentDomain).toContain(
      "correlationKey: `child-run-action/${action.actionId}`",
    );
    expect(agentDomain).toContain("CHILD_RUN_BATCH_PENDING");
    expect(agentDomain).toContain("CHILD_RUN_BATCH_WAIT_INVALID");
  });
});
