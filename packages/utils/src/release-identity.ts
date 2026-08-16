export enum DeploymentService {
  WEB = "web",
  ADMIN = "admin",
  API = "api",
  ADMIN_API = "admin-api",
  AGENT_API = "agent-api",
  MODEL_GATEWAY = "model-gateway",
  AGENT_EXECUTOR = "agent-executor",
  AGENT_EVALUATOR = "agent-evaluator",
  ASSET_PROCESSOR = "asset-processor",
  AUTOMATION_EXECUTOR = "automation-executor",
  LEXICON_BUILDER = "lexicon-builder",
  LEXICON_PUBLISHER = "lexicon-publisher",
}

export enum DeploymentIngestServiceIdentity {
  GITHUB_ACTIONS = "github-actions",
}

export enum DeploymentManifestSchemaVersion {
  V1 = "sylis.deployment-manifest/1",
}

export enum DeploymentEvidenceSchemaVersion {
  V1 = "sylis.deployment-evidence/1",
}

export enum DeploymentEvidenceResult {
  SUCCEEDED = "SUCCEEDED",
}

export enum ReleaseReadinessStatus {
  READY = "ready",
}

export interface ReleaseIdentity {
  status: ReleaseReadinessStatus;
  service: DeploymentService;
  version: string;
  commitSha: string;
}

const LOCAL_RELEASE_VERSION = "0.0.1";
const LOCAL_COMMIT_SHA = "WORKTREE";

export function releaseIdentity(
  service: DeploymentService,
  env: NodeJS.ProcessEnv = process.env,
): ReleaseIdentity {
  return {
    status: ReleaseReadinessStatus.READY,
    service,
    version: env.SYLIS_RELEASE_VERSION?.trim() || LOCAL_RELEASE_VERSION,
    commitSha: env.SYLIS_COMMIT_SHA?.trim() || LOCAL_COMMIT_SHA,
  };
}
