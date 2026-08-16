import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

import {
  AdminAgentRunCommandKind,
  AgentReleaseCommandKind,
} from "./domain-enums";

export function agentReleaseActionDigest(
  action: AgentReleaseCommandKind,
  parameters: Readonly<Record<string, unknown>>,
): string {
  return digest({ action, ...parameters });
}

export function adminAgentRunTerminationDigest(input: {
  runId: string;
  reason: string;
}): string {
  return digest({ action: AdminAgentRunCommandKind.TERMINATE, ...input });
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
