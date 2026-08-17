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

import { AgentApiClient } from "./adapters/agent-api-client";
import { ModelGatewayClient } from "./adapters/model-gateway-client";
import { PublicWebTools } from "./adapters/public-web-tools";
import { SylisTools } from "./adapters/sylis-tools";
import { agentExecutorConfigFromEnv } from "./config/executor-config";
import { createActivateAgentRunHandler } from "./handlers/activate-agent-run";
import {
  AgentExecutorLogEvent,
  AgentExecutorLogLevel,
  JsonAgentExecutorLogger,
} from "./observability/agent-executor-logger";
import { runAgentReconciliationLoop } from "./runtime/reconciliation-loop";
import { AgentToolExecutor } from "./runtime/tool-executor";

async function main(): Promise<void> {
  const config = agentExecutorConfigFromEnv();
  const logger = new JsonAgentExecutorLogger();
  const abort = new AbortController();
  let state: JobWorkerState = {
    status: JobWorkerStatus.STARTING,
    jobId: null,
    attemptId: null,
    updatedAt: new Date().toISOString(),
  };
  const health = startWorkerHealthServer({
    port: config.port,
    service: JobWorkerService.AGENT_EXECUTOR,
    state: () => state,
  });
  const stop = (): void => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const executor = createJobExecutor(
    createHttpJobStore({
      baseUrl: config.adminApiUrl,
      serviceToken: config.serviceToken,
    }),
    {
      instanceId: config.instanceId,
      leaseDurationMs: config.leaseDurationMs,
    },
  );
  const agentApi = new AgentApiClient(
    config.agentApiUrl,
    config.serviceToken,
    globalThis.fetch,
    logger,
  );
  await Promise.all([
    runJobWorker({
      executor,
      kinds: [JobKind.AGENT_RUN_ACTIVATION, JobKind.AGENT_TOOL_CONTINUATION],
      handle: createActivateAgentRunHandler({
        agentApi,
        modelGateway: new ModelGatewayClient(
          config.modelGatewayUrl,
          config.serviceToken,
        ),
        tools: new AgentToolExecutor(
          new PublicWebTools({
            braveSearchApiKey: config.braveSearchApiKey,
            searchUrl: config.publicWebSearchUrl,
            searchTimeoutMs: config.publicWebSearchTimeoutMs,
            pageTimeoutMs: config.publicWebPageTimeoutMs,
            maxPageBytes: config.publicWebPageMaxBytes,
            maxRedirects: config.publicWebMaxRedirects,
            privateFixtureOrigins: config.publicWebPrivateFixtureOrigins,
          }),
          new SylisTools(config.productApiUrl, config.serviceToken),
        ),
        maxParallelToolCalls: config.maxParallelToolCalls,
        logger,
      }),
      signal: abort.signal,
      pollIntervalMs: config.pollIntervalMs,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      onStateChange: (next) => {
        state = next;
      },
    }),
    runAgentReconciliationLoop({
      reconcile: () => agentApi.reconcileInterruptedRuns(),
      signal: abort.signal,
      intervalMs: config.reconciliationIntervalMs,
      onError: (error) => {
        logger.write({
          level: AgentExecutorLogLevel.ERROR,
          event: AgentExecutorLogEvent.RECONCILIATION_FAILED,
          code:
            error instanceof Error &&
            /^[A-Z][A-Z0-9_:.-]{2,159}$/.test(error.message)
              ? error.message
              : "AGENT_RECONCILIATION_FAILED",
        });
      },
    }),
  ]);
  await new Promise<void>((resolve, reject) =>
    health.close((error) => (error ? reject(error) : resolve())),
  );
}

void main();
