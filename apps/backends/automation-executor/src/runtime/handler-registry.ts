import type { SylisDatabase } from "@sylis/database";
import { JobKind } from "@sylis/job-contracts";
import type { JobHandler } from "@sylis/job-runtime";

import { ArtifactStorage } from "../adapters/artifact-storage";
import { AssetObjectStorage } from "../adapters/asset-object-storage";
import { AutomationOwnerClient } from "../adapters/automation-owner-client";
import { ModelGatewayLifecycleClient } from "../adapters/model-gateway-lifecycle-client";
import type { AutomationExecutorConfig } from "../config/executor-config";
import {
  createAuditArchiveHandler,
  createAuditArchivePurgeHandler,
} from "../handlers/audit-archive";
import { createAuditExportHandler } from "../handlers/audit-export";
import { createDataExportHandler } from "../handlers/data-export";
import { createRetentionPurgeHandler } from "../handlers/retention-purge";
import { createSourceSyncHandler } from "../handlers/source-sync";

export function createAutomationHandler(
  database: SylisDatabase,
  config: AutomationExecutorConfig,
): JobHandler {
  const artifactStorage = new ArtifactStorage(config);
  const dataExport = createDataExportHandler(database, artifactStorage, config);
  const handlers: Partial<Record<JobKind, JobHandler>> = {
    [JobKind.DATA_EXPORT]: dataExport,
    [JobKind.AUDIT_ARCHIVE]: createAuditArchiveHandler(
      database,
      artifactStorage,
    ),
    [JobKind.AUDIT_ARCHIVE_PURGE]: createAuditArchivePurgeHandler(
      database,
      artifactStorage,
    ),
    [JobKind.AUDIT_EXPORT]: createAuditExportHandler(database, artifactStorage),
    [JobKind.SOURCE_SYNC]: createSourceSyncHandler(database, globalThis.fetch, {
      allowedOrigins: config.sourceSyncAllowedOrigins,
    }),
    [JobKind.RETENTION_PURGE]: createRetentionPurgeHandler(
      database,
      new AssetObjectStorage(config),
      new AutomationOwnerClient(
        config.agentApiUrl,
        config.apiUrl,
        config.serviceToken,
      ),
      new ModelGatewayLifecycleClient(
        config.modelGatewayUrl,
        config.serviceToken,
      ),
      artifactStorage,
    ),
  };
  return (attempt, executor, signal) => {
    const handler = handlers[attempt.kind];
    if (!handler)
      throw new Error(`AUTOMATION_HANDLER_NOT_FOUND:${attempt.kind}`);
    return handler(attempt, executor, signal);
  };
}
