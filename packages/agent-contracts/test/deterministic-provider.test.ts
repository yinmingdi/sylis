import { describe, expect, it } from "vitest";

import {
  DETERMINISTIC_PROVIDER_SCENARIOS,
  DeterministicProviderScenario,
  deterministicProviderInstruction,
  parseDeterministicProviderInstruction,
} from "../src/testing";

describe("deterministic provider fixture protocol", () => {
  it("TEST-GOVERNANCE-006 publishes the complete stable scenario vocabulary", () => {
    expect(DETERMINISTIC_PROVIDER_SCENARIOS).toEqual([
      "DELAY",
      "DUPLICATE_FRAME",
      "FAILURE",
      "INVALID_TOOL_ARGUMENTS",
      "INVALID_RESPONSE",
      "MALFORMED_STREAM",
      "MIXED_MULTI_TOOL",
      "PARTIAL_STREAM_FAILURE",
      "PROPOSAL",
      "PROPOSAL_CONTINUATION_DELAY",
      "RATE_LIMITED",
      "SERVER_ERROR",
      "TIMEOUT",
      "TOOL_CONTINUATION_DELAY",
      "TRUNCATED_STREAM",
      "UNAUTHORIZED_TOOL",
      "WAIT",
    ]);
  });

  it("TEST-GOVERNANCE-007 serializes the wire format without relying on the parser", () => {
    expect(
      deterministicProviderInstruction(
        DeterministicProviderScenario.WAIT,
        '{"reason":"clarify"}',
      ),
    ).toBe('[[sylis-deterministic-provider:WAIT]]{"reason":"clarify"}');
  });

  it("serializes an omitted content value as an empty payload", () => {
    expect(
      deterministicProviderInstruction(DeterministicProviderScenario.TIMEOUT),
    ).toBe("[[sylis-deterministic-provider:TIMEOUT]]");
  });

  it.each(Object.values(DeterministicProviderScenario))(
    "round-trips the %s scenario and user content",
    (scenario) => {
      const instruction = deterministicProviderInstruction(
        scenario,
        "Explain the word bank.",
      );

      expect(parseDeterministicProviderInstruction(instruction)).toEqual({
        scenario,
        content: "Explain the word bank.",
      });
    },
  );

  it("does not interpret ordinary user content as fixture control", () => {
    expect(
      parseDeterministicProviderInstruction("Explain [TIMEOUT] in English."),
    ).toBeNull();
  });

  it("TEST-GOVERNANCE-008 parses a literal wire instruction without relying on the serializer", () => {
    expect(
      parseDeterministicProviderInstruction(
        "[[sylis-deterministic-provider:PROPOSAL]]proposal-content",
      ),
    ).toEqual({
      scenario: DeterministicProviderScenario.PROPOSAL,
      content: "proposal-content",
    });
  });

  it.each([
    "XXsylis-deterministic-provider:WAIT]]wrong-prefix",
    "[[sylis-deterministic-provider:WAITX",
    "[[sylis-deterministic-provider:UNKNOWN]]payload",
    "[[sylis-deterministic-provider:]]payload",
  ])("TEST-GOVERNANCE-009 rejects malformed fixture input %s", (value) => {
    expect(parseDeterministicProviderInstruction(value)).toBeNull();
  });
});
