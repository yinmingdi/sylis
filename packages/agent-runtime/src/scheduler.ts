import {
  AgentStepDirectiveMode,
  AgentStepOutcomeStatus,
  AgentToolConcurrencyMode,
  type AgentStepExecutionDirective,
  type AgentStepOutcome,
} from "@sylis/agent-contracts";

import type { AgentToolPort } from "./types";

interface ToolLifecycle {
  start(directive: AgentStepExecutionDirective): Promise<void>;
  record(outcome: AgentStepOutcome): Promise<void>;
}

export async function executePlan(
  directives: readonly AgentStepExecutionDirective[],
  tool: AgentToolPort,
  lifecycle: ToolLifecycle,
  maxParallelToolCalls: number,
  signal: AbortSignal,
): Promise<readonly AgentStepOutcome[]> {
  const ordered = [...directives].sort(
    (left, right) => left.modelPosition - right.modelPosition,
  );
  const outcomes = new Map<string, AgentStepOutcome>();
  const pending = new Map<string, Promise<void>>();

  const start = (directive: AgentStepExecutionDirective): void => {
    const promise = executeDirective(directive, tool, lifecycle, signal).then(
      (outcome) => {
        outcomes.set(directive.actionId, outcome);
        pending.delete(directive.actionId);
      },
    );
    pending.set(directive.actionId, promise);
  };
  const drain = async (): Promise<void> => {
    await Promise.all(pending.values());
  };

  for (let index = 0; index < ordered.length; index += 1) {
    const directive = ordered[index];
    if (!directive) continue;
    if (signal.aborted) {
      await drain();
      cancelRemaining(ordered.slice(index), outcomes);
      break;
    }
    if (directive.concurrencyMode === AgentToolConcurrencyMode.EXCLUSIVE) {
      await drain();
      start(directive);
      await drain();
      const outcome = outcomes.get(directive.actionId);
      if (outcome?.status === AgentStepOutcomeStatus.WAITING) {
        cancelRemaining(ordered.slice(index + 1), outcomes);
        break;
      }
      continue;
    }
    start(directive);
    if (pending.size >= Math.max(1, maxParallelToolCalls)) {
      await Promise.race(pending.values());
    }
  }
  await drain();
  return ordered.map(
    (directive) =>
      outcomes.get(directive.actionId) ?? {
        actionId: directive.actionId,
        modelPosition: directive.modelPosition,
        status: AgentStepOutcomeStatus.CANCELLED,
      },
  );
}

async function executeDirective(
  directive: AgentStepExecutionDirective,
  tool: AgentToolPort,
  lifecycle: ToolLifecycle,
  signal: AbortSignal,
): Promise<AgentStepOutcome> {
  if (directive.mode === AgentStepDirectiveMode.SETTLED) {
    return directive.settledOutcome;
  }
  await lifecycle.start(directive);
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new Error("AGENT_TOOL_TIMEOUT")),
    directive.tool.timeoutMs,
  );
  let rejectInterrupted: (reason?: unknown) => void = () => undefined;
  const onInterrupted = (): void =>
    rejectInterrupted(
      controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new Error("AGENT_TOOL_CANCELLED"),
    );
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject;
    if (controller.signal.aborted) onInterrupted();
    else
      controller.signal.addEventListener("abort", onInterrupted, {
        once: true,
      });
  });
  let outcome: AgentStepOutcome;
  try {
    const result = await Promise.race([
      tool.execute(directive.tool, controller.signal),
      interrupted,
    ]);
    outcome = {
      actionId: directive.actionId,
      modelPosition: directive.modelPosition,
      status: AgentStepOutcomeStatus.SUCCEEDED,
      result,
    };
  } catch (error) {
    const executionWasInterrupted = controller.signal.aborted;
    outcome = {
      actionId: directive.actionId,
      modelPosition: directive.modelPosition,
      status:
        executionWasInterrupted &&
        directive.concurrencyMode === AgentToolConcurrencyMode.EXCLUSIVE
          ? AgentStepOutcomeStatus.UNKNOWN_OUTCOME
          : signal.aborted
            ? AgentStepOutcomeStatus.CANCELLED
            : AgentStepOutcomeStatus.FAILED,
      errorCode: runtimeErrorCode(error),
    };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onInterrupted);
  }
  await lifecycle.record(outcome);
  return outcome;
}

function cancelRemaining(
  directives: readonly AgentStepExecutionDirective[],
  outcomes: Map<string, AgentStepOutcome>,
): void {
  for (const directive of directives) {
    if (outcomes.has(directive.actionId)) continue;
    outcomes.set(directive.actionId, {
      actionId: directive.actionId,
      modelPosition: directive.modelPosition,
      status: AgentStepOutcomeStatus.CANCELLED,
    });
  }
}

function runtimeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,127}$/.test(error.message)) {
    return error.message;
  }
  return "AGENT_TOOL_EXECUTION_FAILED";
}
