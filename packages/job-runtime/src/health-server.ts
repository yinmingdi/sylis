import {
  DeploymentService,
  releaseIdentity,
} from "@sylis/utils/release-identity";
import { createServer, type Server } from "node:http";

import { JobWorkerStatus, type JobWorkerState } from "./worker-state";

export enum JobWorkerService {
  AGENT_EXECUTOR = "agent-executor",
  AGENT_EVALUATOR = "agent-evaluator",
  ASSET_PROCESSOR = "asset-processor",
  AUTOMATION_EXECUTOR = "automation-executor",
  LEXICON_BUILDER = "lexicon-builder",
  LEXICON_PUBLISHER = "lexicon-publisher",
}

const WORKER_DEPLOYMENT_SERVICES: Record<JobWorkerService, DeploymentService> =
  {
    [JobWorkerService.AGENT_EXECUTOR]: DeploymentService.AGENT_EXECUTOR,
    [JobWorkerService.AGENT_EVALUATOR]: DeploymentService.AGENT_EVALUATOR,
    [JobWorkerService.ASSET_PROCESSOR]: DeploymentService.ASSET_PROCESSOR,
    [JobWorkerService.AUTOMATION_EXECUTOR]:
      DeploymentService.AUTOMATION_EXECUTOR,
    [JobWorkerService.LEXICON_BUILDER]: DeploymentService.LEXICON_BUILDER,
    [JobWorkerService.LEXICON_PUBLISHER]: DeploymentService.LEXICON_PUBLISHER,
  };

export interface WorkerHealthServerOptions {
  port: number;
  service: JobWorkerService;
  state: () => JobWorkerState;
  checkReadiness?: () => Promise<void>;
}

export function startWorkerHealthServer(
  options: WorkerHealthServerOptions,
): Server {
  return createServer((request, response) => {
    void handleHealthRequest(options, request.url, response);
  }).listen(options.port, "0.0.0.0");
}

async function handleHealthRequest(
  options: WorkerHealthServerOptions,
  path: string | undefined,
  response: import("node:http").ServerResponse,
): Promise<void> {
  if (path !== "/health" && path !== "/live" && path !== "/ready") {
    response.writeHead(404).end();
    return;
  }

  const state = options.state();
  const live = state.status !== JobWorkerStatus.STOPPED;
  let ready =
    state.status !== JobWorkerStatus.STARTING &&
    state.status !== JobWorkerStatus.RECOVERING &&
    state.status !== JobWorkerStatus.DRAINING &&
    state.status !== JobWorkerStatus.STOPPED;
  if (ready && options.checkReadiness) {
    try {
      await options.checkReadiness();
    } catch {
      ready = false;
    }
  }

  const healthy = path === "/live" ? live : path === "/ready" ? ready : live;
  response.writeHead(healthy ? 200 : 503, {
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  response.end(
    JSON.stringify({
      ...releaseIdentity(WORKER_DEPLOYMENT_SERVICES[options.service]),
      status: path === "/ready" ? (ready ? "ready" : "not_ready") : "ok",
      worker: state,
    }),
  );
}
