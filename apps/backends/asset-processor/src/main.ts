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

import { AssetApiClient } from "./adapters/asset-api-client";
import { ClamAvClient } from "./adapters/clamav";
import { ModelGatewayClient } from "./adapters/model-gateway-client";
import { SignedObjectStorage } from "./adapters/object-storage";
import { assetProcessorConfigFromEnv } from "./config/processor-config";
import { createAssetHandler } from "./handlers/process-asset";

async function main(): Promise<void> {
  const config = assetProcessorConfigFromEnv();
  const abort = new AbortController();
  let state: JobWorkerState = {
    status: JobWorkerStatus.STARTING,
    jobId: null,
    attemptId: null,
    updatedAt: new Date().toISOString(),
  };
  const health = startWorkerHealthServer({
    port: config.port,
    service: JobWorkerService.ASSET_PROCESSOR,
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
    kinds: [
      JobKind.ASSET_SCAN,
      JobKind.ASSET_EXTRACT,
      JobKind.ASSET_OCR,
      JobKind.ASSET_LEXICAL_INDEX,
      JobKind.ASSET_EMBEDDING,
      JobKind.ASSET_IMAGE_ANALYSIS,
    ],
    handle: createAssetHandler({
      assetApi: new AssetApiClient(config.agentApiUrl, config.serviceToken),
      clamav: new ClamAvClient(config.clamavHost, config.clamavPort),
      modelGateway: new ModelGatewayClient(
        config.modelGatewayUrl,
        config.serviceToken,
      ),
      storage: new SignedObjectStorage(config.maxAssetBytes),
      limits: config,
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
