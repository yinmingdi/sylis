import { createPrismaClient } from "@sylis/database";
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

import { lexiconPublisherConfigFromEnv } from "./config/publisher-config";
import { createLexiconPublishHandler } from "./handlers/publish-lexicon";

async function main(): Promise<void> {
  const config = lexiconPublisherConfigFromEnv();
  const database = createPrismaClient({
    url: config.databaseUrl,
    log: ["error"],
  });
  const abort = new AbortController();
  let state: JobWorkerState = {
    status: JobWorkerStatus.STARTING,
    jobId: null,
    attemptId: null,
    updatedAt: new Date().toISOString(),
  };
  const health = startWorkerHealthServer({
    port: config.port,
    service: JobWorkerService.LEXICON_PUBLISHER,
    state: () => state,
    checkReadiness: () => database.$queryRaw`SELECT 1`.then(() => undefined),
  });
  const stop = (): void => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await database.$connect();
  try {
    await runJobWorker({
      executor: createJobExecutor(
        createHttpJobStore({
          baseUrl: config.adminApiUrl,
          serviceToken: config.serviceToken,
        }),
        { instanceId: config.instanceId },
      ),
      kinds: [JobKind.LEXICON_PUBLISH, JobKind.LEXICON_VALIDATE],
      handle: createLexiconPublishHandler(database, config),
      signal: abort.signal,
      pollIntervalMs: config.pollIntervalMs,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      onStateChange: (next) => {
        state = next;
      },
    });
  } finally {
    await database.$disconnect();
    await new Promise<void>((resolveClose, reject) =>
      health.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
}

void main();
