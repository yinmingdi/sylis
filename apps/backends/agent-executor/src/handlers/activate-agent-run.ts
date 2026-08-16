import {
  AgentActivationResultStatus,
  type AgentActivationResult,
} from "@sylis/agent-contracts";
import { createAgentRuntime } from "@sylis/agent-runtime";
import { JobEventType, JobProgressEtaReliability } from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";

import { AgentApiClient } from "../adapters/agent-api-client";
import { ModelGatewayClient } from "../adapters/model-gateway-client";
import { AgentToolExecutor } from "../runtime/tool-executor";

enum AgentExecutionResultType {
  AGENT_RUN = "agent-run",
}

enum AgentExecutionProgressStage {
  RUNTIME = "agent-runtime",
}

export function createActivateAgentRunHandler(dependencies: {
  agentApi: AgentApiClient;
  modelGateway: ModelGatewayClient;
  tools: AgentToolExecutor;
  maxParallelToolCalls: number;
}) {
  return async (
    attempt: ClaimedAttempt,
    executor: JobExecutor,
  ): Promise<{ resultType: string; resultId: string }> => {
    const activation = await dependencies.agentApi.getActivation(attempt);
    const controller = new AbortController();
    const cancellationMonitor = setInterval(() => {
      void executor
        .isCancellationRequested(attempt)
        .then((requested) => {
          if (requested) controller.abort(new Error("JOB_CANCELLED"));
        })
        .catch(() => undefined);
    }, 250);
    cancellationMonitor.unref();
    const runtime = createAgentRuntime({
      model: dependencies.modelGateway,
      step: dependencies.agentApi.runtimePort(attempt),
      tool: {
        execute: (directive, signal) =>
          dependencies.tools.execute(activation.userId, directive, signal),
      },
      maxParallelToolCalls: dependencies.maxParallelToolCalls,
    });
    try {
      const result = await runtime.activate(activation, {
        signal: controller.signal,
      });
      if (
        result.status === AgentActivationResultStatus.FAILED ||
        result.status === AgentActivationResultStatus.CANCELLED
      ) {
        await dependencies.agentApi.settleActivation(
          attempt,
          result,
          controller.signal.aborted ? undefined : controller.signal,
        );
      }
      await executor.progress(attempt, {
        type: JobEventType.PROGRESS,
        stage: AgentExecutionProgressStage.RUNTIME,
        processed: result.completedSteps,
        total: result.completedSteps,
        etaReliability: JobProgressEtaReliability.HIGH,
        attemptId: attempt.attemptId,
      });
      return {
        resultType: AgentExecutionResultType.AGENT_RUN,
        resultId: activation.runId,
      };
    } catch (error) {
      const result: AgentActivationResult = {
        runId: activation.runId,
        status: controller.signal.aborted
          ? AgentActivationResultStatus.CANCELLED
          : AgentActivationResultStatus.FAILED,
        completedSteps: 0,
        errorCode: executionFailureCode(error),
      };
      await dependencies.agentApi.settleActivation(attempt, result);
      throw error;
    } finally {
      clearInterval(cancellationMonitor);
    }
  };
}

function executionFailureCode(error: unknown): string {
  if (
    error instanceof Error &&
    /^[A-Z][A-Z0-9_:.-]{2,159}$/.test(error.message)
  ) {
    return error.message;
  }
  return "AGENT_RUNTIME_FAILED";
}
