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

import { automationExecutorConfigFromEnv } from "./config/executor-config";
import { createAutomationHandler } from "./runtime/handler-registry";

async function main(): Promise<void> {
  const config = automationExecutorConfigFromEnv();
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
    service: JobWorkerService.AUTOMATION_EXECUTOR,
    state: () => state,
    checkReadiness: () => database.$queryRaw`SELECT 1`.then(() => undefined),
  });
  process.once("SIGINT", () => abort.abort());
  process.once("SIGTERM", () => abort.abort());
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
      kinds: [
        JobKind.DATA_EXPORT,
        JobKind.AUDIT_ARCHIVE,
        JobKind.AUDIT_ARCHIVE_PURGE,
        JobKind.AUDIT_EXPORT,
        JobKind.SOURCE_SYNC,
        JobKind.RETENTION_PURGE,
      ],
      handle: createAutomationHandler(database, config),
      signal: abort.signal,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      onStateChange: (next) => {
        state = next;
      },
    });
  } finally {
    await database.$disconnect();
    await new Promise<void>((resolve, reject) =>
      health.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

void main();
