export enum AgentToolBudgetRejectionCode {
  RUN_LIMIT_EXCEEDED = "AGENT_RUN_TOOL_LIMIT_EXCEEDED",
  GRANT_EXHAUSTED = "AGENT_TOOL_GRANT_EXHAUSTED",
}

interface ToolBudgetCall {
  actionId: string;
  grantId: string;
  grantUsed: number;
  grantMaximum: number;
}

interface ToolBudgetAllocationInput {
  run: { used: number; maximum: number };
  calls: readonly ToolBudgetCall[];
}

export interface ToolBudgetAllocation {
  actionId: string;
  rejectionCode?: AgentToolBudgetRejectionCode;
}

export function allocateToolCallBudget(
  input: ToolBudgetAllocationInput,
): readonly ToolBudgetAllocation[] {
  let acceptedForRun = 0;
  const acceptedByGrant = new Map<string, number>();
  return input.calls.map((call) => {
    if (input.run.used + acceptedForRun >= input.run.maximum) {
      return {
        actionId: call.actionId,
        rejectionCode: AgentToolBudgetRejectionCode.RUN_LIMIT_EXCEEDED,
      };
    }
    const acceptedForGrant = acceptedByGrant.get(call.grantId) ?? 0;
    if (call.grantUsed + acceptedForGrant >= call.grantMaximum) {
      return {
        actionId: call.actionId,
        rejectionCode: AgentToolBudgetRejectionCode.GRANT_EXHAUSTED,
      };
    }
    acceptedForRun += 1;
    acceptedByGrant.set(call.grantId, acceptedForGrant + 1);
    return { actionId: call.actionId };
  });
}
