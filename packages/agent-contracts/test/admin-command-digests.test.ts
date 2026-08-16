import { describe, expect, it } from "vitest";

import {
  AgentReleaseCommandKind,
  AgentReleaseEnvironment,
  AgentReleaseKind,
} from "../src";
import {
  adminAgentRunTerminationDigest,
  agentReleaseActionDigest,
} from "../src/admin-command-digests";

describe("admin command digests", () => {
  it("changes when a release preview parameter changes", () => {
    const input = {
      releaseKind: AgentReleaseKind.CAPABILITY,
      releaseId: "11111111-1111-4111-8111-111111111111",
      reason: "Promote the verified capability",
      environment: AgentReleaseEnvironment.STAGING,
    };

    expect(
      agentReleaseActionDigest(AgentReleaseCommandKind.PROMOTE, input),
    ).not.toBe(
      agentReleaseActionDigest(AgentReleaseCommandKind.PROMOTE, {
        ...input,
        environment: AgentReleaseEnvironment.PRODUCTION,
      }),
    );
  });

  it("binds a termination preview to the run and normalized reason", () => {
    expect(
      adminAgentRunTerminationDigest({
        runId: "11111111-1111-4111-8111-111111111111",
        reason: "Security incident response",
      }),
    ).not.toBe(
      adminAgentRunTerminationDigest({
        runId: "22222222-2222-4222-8222-222222222222",
        reason: "Security incident response",
      }),
    );
  });
});
