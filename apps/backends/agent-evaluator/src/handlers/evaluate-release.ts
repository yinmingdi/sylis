import {
  resolveAgentEvaluationSuite,
  scoreAgentEvaluation,
} from "@sylis/agent-contracts";
import { JobKind, JobProgressEtaReliability } from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";

import { EvaluationStorage } from "../adapters/evaluation-storage";
import { ModelGatewayClient } from "../adapters/model-gateway-client";

enum AgentEvaluationProgressStage {
  EVALUATING = "EVALUATING",
  EVIDENCE_COMMITTED = "EVIDENCE_COMMITTED",
  JUDGING = "JUDGING",
}

enum AgentEvaluationResultType {
  EVIDENCE = "agent-evaluation-evidence",
}

export function createEvaluateReleaseHandler(dependencies: {
  modelGateway: ModelGatewayClient;
  storage: EvaluationStorage;
}) {
  return async (attempt: ClaimedAttempt, executor: JobExecutor) => {
    const input = evaluationInput(attempt);
    await executor.progress(attempt, {
      stage: input.judge
        ? AgentEvaluationProgressStage.JUDGING
        : AgentEvaluationProgressStage.EVALUATING,
      processed: 0,
      total: 1,
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
    const candidate = await dependencies.modelGateway.evaluate(input);
    const result = {
      evidenceId: candidate.evidenceId,
      ...scoreAgentEvaluation(
        resolveAgentEvaluationSuite(input.suiteRef),
        candidate,
      ),
    };
    await dependencies.storage.commit(attempt, result);
    await executor.progress(attempt, {
      stage: AgentEvaluationProgressStage.EVIDENCE_COMMITTED,
      processed: 1,
      total: 1,
      etaSeconds: 0,
      etaReliability: JobProgressEtaReliability.HIGH,
    });
    return {
      resultType: AgentEvaluationResultType.EVIDENCE,
      resultId: result.evidenceId,
      summary: { score: result.score, passed: result.passed },
    };
  };
}

function evaluationInput(attempt: ClaimedAttempt) {
  const { requestId, releaseId, suiteRef, permitId } = attempt.inputRef;
  if (
    typeof requestId !== "string" ||
    typeof releaseId !== "string" ||
    typeof suiteRef !== "string" ||
    typeof permitId !== "string"
  ) {
    throw new Error("EVALUATION_INPUT_INVALID");
  }
  return {
    evaluationRunId: requestId,
    releaseId,
    suiteRef,
    permitId,
    judge: attempt.kind === JobKind.AGENT_RELEASE_JUDGEMENT,
  };
}
