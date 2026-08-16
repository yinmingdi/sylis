export enum DeterministicProviderScenario {
  DELAY = "DELAY",
  DUPLICATE_FRAME = "DUPLICATE_FRAME",
  FAILURE = "FAILURE",
  INVALID_TOOL_ARGUMENTS = "INVALID_TOOL_ARGUMENTS",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  MALFORMED_STREAM = "MALFORMED_STREAM",
  MIXED_MULTI_TOOL = "MIXED_MULTI_TOOL",
  PARTIAL_STREAM_FAILURE = "PARTIAL_STREAM_FAILURE",
  PROPOSAL = "PROPOSAL",
  PROPOSAL_CONTINUATION_DELAY = "PROPOSAL_CONTINUATION_DELAY",
  RATE_LIMITED = "RATE_LIMITED",
  SERVER_ERROR = "SERVER_ERROR",
  TIMEOUT = "TIMEOUT",
  TOOL_CONTINUATION_DELAY = "TOOL_CONTINUATION_DELAY",
  TRUNCATED_STREAM = "TRUNCATED_STREAM",
  UNAUTHORIZED_TOOL = "UNAUTHORIZED_TOOL",
  WAIT = "WAIT",
}

export const DETERMINISTIC_PROVIDER_SCENARIOS = Object.values(
  DeterministicProviderScenario,
);

export interface DeterministicProviderInstruction {
  scenario: DeterministicProviderScenario;
  content: string;
}

const fixturePrefix = "[[sylis-deterministic-provider:";
const fixtureSuffix = "]]";

export function deterministicProviderInstruction(
  scenario: DeterministicProviderScenario,
  content = "",
): string {
  return `${fixturePrefix}${scenario}${fixtureSuffix}${content}`;
}

export function parseDeterministicProviderInstruction(
  value: string,
): DeterministicProviderInstruction | null {
  if (!value.startsWith(fixturePrefix)) return null;
  const suffixIndex = value.indexOf(fixtureSuffix, fixturePrefix.length);
  if (suffixIndex === -1) return null;
  const scenario = value.slice(fixturePrefix.length, suffixIndex);
  if (
    !DETERMINISTIC_PROVIDER_SCENARIOS.includes(
      scenario as DeterministicProviderScenario,
    )
  ) {
    return null;
  }
  return {
    scenario: scenario as DeterministicProviderScenario,
    content: value.slice(suffixIndex + fixtureSuffix.length),
  };
}
