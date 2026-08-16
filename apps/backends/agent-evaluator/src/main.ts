import { JobKind } from "@sylis/job-contracts";
import {
  createHttpJobStore,
  createJobExecutor,
  JobWorkerService,
  JobWorkerStatus,
  runJobWorker,
  startWorkerHealthServer,
  type JobWorkerState,
} from "@sylis/job-runtime";

import { EvaluationStorage } from "./adapters/evaluation-storage";
import { ModelGatewayClient } from "./adapters/model-gateway-client";
import { agentEvaluatorConfigFromEnv } from "./config/evaluator-config";
import { createEvaluateReleaseHandler } from "./handlers/evaluate-release";

async function main(): Promise<void> {
  const config = agentEvaluatorConfigFromEnv();
  const abort = new AbortController();
  let state: JobWorkerState = {
    status: JobWorkerStatus.STARTING,
    jobId: null,
    attemptId: null,
    updatedAt: new Date().toISOString(),
  };
  const health = startWorkerHealthServer({
    port: config.port,
    service: JobWorkerService.AGENT_EVALUATOR,
    state: () => state,
  });
  process.once("SIGINT", () => abort.abort());
  process.once("SIGTERM", () => abort.abort());
  await runJobWorker({
    executor: createJobExecutor(
      createHttpJobStore({
        baseUrl: config.adminApiUrl,
        serviceToken: config.serviceToken,
      }),
      { instanceId: config.instanceId },
    ),
    kinds: [JobKind.AGENT_RELEASE_EVALUATION, JobKind.AGENT_RELEASE_JUDGEMENT],
    handle: createEvaluateReleaseHandler({
      modelGateway: new ModelGatewayClient(
        config.modelGatewayUrl,
        config.serviceToken,
      ),
      storage: new EvaluationStorage(config.agentApiUrl, config.serviceToken),
    }),
    signal: abort.signal,
    onStateChange: (next) => {
      state = next;
    },
  });
  await new Promise<void>((resolve, reject) =>
    health.close((error) => (error ? reject(error) : resolve())),
  );
}

void main();
