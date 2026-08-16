import type {
  AdminAgentRunCommandKind,
  AgentEvaluationKind,
  AgentReleaseCommandKind,
  AgentReleaseEnvironment,
  AgentReleaseKind,
  AgentReleaseStatus,
  AgentRunStatus,
} from "@sylis/agent-contracts";

export type AdminJsonObject = Readonly<Record<string, unknown>>;

export enum AdminSessionAudience {
  ADMIN = "ADMIN",
}

export enum AdminSessionAuthStrength {
  PASSWORD = "PASSWORD",
  PASSWORD_MFA = "PASSWORD_MFA",
}

export enum LegalHoldScopeKind {
  GLOBAL = "GLOBAL",
  AUDIT_CATEGORY = "AUDIT_CATEGORY",
  AUDIT_ARCHIVE = "AUDIT_ARCHIVE",
}

export enum BuildRunMode {
  PILOT = "PILOT",
  FULL = "FULL",
}

export enum LexiconCompileProfile {
  PILOT_200 = "PILOT_200",
  CORE_20000 = "CORE_20000",
}

export enum ApprovalDecisionKind {
  APPROVE = "APPROVE",
  REJECT = "REJECT",
}

export enum SourceDatasetVersionStatus {
  REGISTERED = "REGISTERED",
  VALIDATED = "VALIDATED",
  QUARANTINED = "QUARANTINED",
  RETIRED = "RETIRED",
}

export enum ContentEvidenceKind {
  DIRECT = "DIRECT",
  DERIVED = "DERIVED",
  SUPPORTING = "SUPPORTING",
  CONTRADICTING = "CONTRADICTING",
  GENERATED = "GENERATED",
}

export enum RightsEvidenceKind {
  LICENSE_TEXT = "LICENSE_TEXT",
  TERMS_OF_USE = "TERMS_OF_USE",
  OWNER_PERMISSION = "OWNER_PERMISSION",
  LEGAL_REVIEW = "LEGAL_REVIEW",
  POLICY_DOCUMENT = "POLICY_DOCUMENT",
}

export enum ReviewDecisionKind {
  APPROVE = "APPROVE",
  REJECT = "REJECT",
  ACCEPT_WARNING = "ACCEPT_WARNING",
}

export enum JobStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  RETRY_SCHEDULED = "RETRY_SCHEDULED",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum CredentialType {
  API_KEY = "API_KEY",
  OAUTH_ACCESS_TOKEN = "OAUTH_ACCESS_TOKEN",
  OAUTH_REFRESH_TOKEN = "OAUTH_REFRESH_TOKEN",
  SERVICE_ACCOUNT_JSON = "SERVICE_ACCOUNT_JSON",
}

export enum CredentialStatus {
  PENDING = "PENDING",
  VERIFIED = "VERIFIED",
  RETIRED = "RETIRED",
  QUARANTINED = "QUARANTINED",
  EXPIRED = "EXPIRED",
  REVOKED = "REVOKED",
}

export enum ProviderHealthProbeKind {
  AUTHENTICATION = "AUTHENTICATION",
  STRUCTURED_GENERATION = "STRUCTURED_GENERATION",
  STREAMING_GENERATION = "STREAMING_GENERATION",
  EMBEDDING = "EMBEDDING",
  VISION = "VISION",
}

export enum ModelPolicyScopeKind {
  PLATFORM = "PLATFORM",
  USER = "USER",
  CAPABILITY_RELEASE = "CAPABILITY_RELEASE",
  AGENT_RUN = "AGENT_RUN",
  BUILD_RUN = "BUILD_RUN",
  EVALUATION_RUN = "EVALUATION_RUN",
  ASSET_REVISION = "ASSET_REVISION",
}

export enum ModelPurposeKind {
  AGENT_RUN = "AGENT_RUN",
  LEXICON_BUILD = "LEXICON_BUILD",
  AGENT_EVALUATION = "AGENT_EVALUATION",
  ASSET_PROCESSING = "ASSET_PROCESSING",
}

export enum SecurityAuditResult {
  SUCCEEDED = "SUCCEEDED",
  DENIED = "DENIED",
  FAILED = "FAILED",
}

export enum SecurityAuditCategory {
  IDENTITY = "IDENTITY",
  AUTHORIZATION = "AUTHORIZATION",
  SOURCE = "SOURCE",
  RIGHTS = "RIGHTS",
  REVIEW = "REVIEW",
  LEXICON = "LEXICON",
  AGENT = "AGENT",
  MODEL = "MODEL",
  ASSET = "ASSET",
  JOB = "JOB",
  USER_SUPPORT = "USER_SUPPORT",
  SECURITY = "SECURITY",
  DEPLOYMENT = "DEPLOYMENT",
  RETENTION = "RETENTION",
}

export enum OverviewSectionStatus {
  READY = "READY",
  DEGRADED = "DEGRADED",
  OMITTED = "OMITTED",
}

export interface AdminBuildRunInput {
  mode: BuildRunMode;
  manifestUri: string;
  manifestHash: string;
  compileProfile: LexiconCompileProfile;
  modelPolicy: AdminJsonObject;
  budgetMicros: string;
  codeVersion: string;
  schemaVersion: string;
  providerRouteReleaseId?: string;
  credentialRevisionId?: string;
  pilotEvidenceRunId?: string;
  forecastHash?: string;
}

export interface AdminBuildBudgetApprovalInput {
  approvedBudgetMicros: string;
  forecastHash: string;
  actionDigest: string;
  reason: string;
}

export interface AdminBuildBudgetApprovalPreviewInput {
  approvedBudgetMicros: string;
  forecastHash: string;
}

export interface AdminBuildBudgetApprovalPreview {
  runId: string;
  status: string;
  currentBudgetMicros: string;
  approvedBudgetMicros: string;
  increaseMicros: string;
  forecastHash: string;
  buildRequestHash: string;
  actionDigest: string;
}

export interface AdminBuildRunReceipt {
  runId: string;
  jobId: string | null;
}

export interface AdminBuildBudgetApprovalReceipt {
  runId: string;
  budgetApprovalId: string;
  jobId: string;
}

export interface AdminPublishRunInput {
  artifactUri: string;
  artifactHash: string;
  expectedSchema: string;
}

export interface AdminCommandReceipt {
  runId: string;
  jobId: string;
}

export interface AdminSourceRightsInput {
  mayBuild: boolean;
  mayServe: boolean;
  mayExport: boolean;
  requiresAttribution: boolean;
  attribution?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface AdminRegisterSourceVersionInput {
  datasetKey: string;
  datasetName: string;
  homepageUri: string;
  version: string;
  sourceUri: string;
  checksum: string;
  retrievedAt: string;
  adapter: string;
  parserVersion: string;
  schemaVersion: string;
  validationSummary: AdminJsonObject;
  status: SourceDatasetVersionStatus;
  rights: AdminSourceRightsInput;
}

export interface AdminRightsDecisionInput {
  policyVersion: string;
  evidence: Array<{
    evidenceKind: RightsEvidenceKind;
    referenceUri: string;
    contentHash: string;
    note?: string;
    capturedAt: string;
  }>;
  mayBuild: boolean;
  mayServe: boolean;
  mayExport: boolean;
  attribution?: string;
  restrictions: string[];
  effectiveAt: string;
  reason: string;
}

export interface AdminCandidateRevisionInput {
  expectedRevisionId: string;
  schemaVersion: string;
  payload: AdminJsonObject;
  evidence: Array<{
    evidenceKind: ContentEvidenceKind;
    sourceRecordId?: string;
    upstreamProvenanceId?: string;
    note?: string;
  }>;
  validationSummary: AdminJsonObject;
  reason: string;
}

export interface AdminReviewDecisionInput {
  candidateRevisionId: string;
  decision: ReviewDecisionKind;
  reason: string;
}

export interface AdminAuditQuery {
  from: string;
  to: string;
  category?: SecurityAuditCategory;
  result?: SecurityAuditResult;
  action?: string;
  actorRole?: AdminOperatorRole;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  correlationId?: string;
  actionDigest?: string;
  deploymentId?: string;
  limit?: number;
}

export interface AdminCreateLegalHoldInput {
  scopeKind: LegalHoldScopeKind;
  scopeRef?: string;
  reason: string;
  externalReference?: string;
  reviewAt: string;
}

export interface AdminCreateAuditArchiveInput {
  category: SecurityAuditCategory;
  from: string;
  to: string;
  reason: string;
}

export interface AdminPurgeAuditArchiveInput {
  reason: string;
}

export interface AdminAuditArchiveReceipt {
  archiveId: string;
  jobId: string;
}

export interface AdminAuditExportReceipt {
  exportId: string;
  jobId: string;
}

export interface AdminReleaseLegalHoldInput {
  reason: string;
}

export interface AdminCreateAuditRetentionPolicyInput {
  category: SecurityAuditCategory;
  onlineDays: number;
  archiveDays: number;
  policyVersion: string;
  effectiveAt: string;
}

export interface AdminAuditRetentionView {
  policies: AdminEntityView[];
  archives: AdminEntityView[];
}

export interface AdminCreateAuditExportInput extends AdminAuditQuery {
  streams: Array<"DATA_ACCESS" | "SECURITY">;
  reason: string;
}

export interface AdminCreateCredentialInput {
  providerKey: string;
  label: string;
  credentialType: CredentialType;
  secret: string;
  metadata: AdminJsonObject;
  expiresAt?: string;
  reason: string;
}

export interface AdminRotateCredentialInput {
  credentialType: CredentialType;
  secret: string;
  metadata: AdminJsonObject;
  expiresAt?: string;
  reason: string;
}

export interface AdminCreateBudgetPolicyInput {
  scopeKind: ModelPolicyScopeKind;
  scopeId?: string;
  purpose: ModelPurposeKind;
  maxUnits: string;
  maxCostMicros: string;
  windowSeconds: number;
  policyVersion: string;
  reason: string;
}

export interface AdminCreateQuotaPolicyInput {
  scopeKind: ModelPolicyScopeKind;
  scopeId?: string;
  purpose: ModelPurposeKind;
  routeReleaseId?: string;
  maxRequests: string;
  maxUnits: string;
  windowSeconds: number;
  policyVersion: string;
  reason: string;
}

export interface AdminOverviewSection {
  status: OverviewSectionStatus;
  observedAt: string;
  data?: unknown;
  reason?: string;
}

export interface AdminOverviewView {
  observedAt: string;
  sections: Readonly<Record<string, AdminOverviewSection>>;
}

export interface AdminEntityView extends AdminJsonObject {
  id: string;
  status?: string;
  createdAt?: string;
}

export interface AdminSecurityAuditEventView extends AdminEntityView {
  actorUserId: string | null;
  sessionId: string | null;
  category: SecurityAuditCategory;
  action: string;
  actorRole: AdminOperatorRole | null;
  targetType: string | null;
  targetId: string | null;
  targetRevisionId: string | null;
  result: SecurityAuditResult;
  occurredAt: string;
}

export interface AdminDataAccessAuditEventView extends AdminEntityView {
  actorUserId: string;
  ownerUserId: string;
  supportGrantId: string;
  purpose: string;
  resourceKind: string;
  resourceId: string;
  resourceRevisionId: string;
  result: SecurityAuditResult;
  requestId: string;
  occurredAt: string;
}

export type AdminAuditEventView =
  | AdminSecurityAuditEventView
  | AdminDataAccessAuditEventView;

export interface AdminSupportGrantAccessView {
  grantId: string;
  resourceKind: string;
  resourceId: string;
  resourceRevisionId: string;
  purpose: string;
  expiresAt: string;
  audit: {
    id: string;
    requestId: string;
    result: SecurityAuditResult;
    occurredAt: string;
  };
  resource: unknown;
}

export interface AdminJobView extends AdminEntityView {
  kind: string;
  status: JobStatus;
  attempts?: readonly AdminJsonObject[];
  progress?: readonly AdminJsonObject[];
  errorCode?: string | null;
  cancelRequestedAt?: string | null;
}

export interface AdminCredentialRevisionView extends AdminEntityView {
  revisionNo: number;
  credentialType: CredentialType;
  status: CredentialStatus;
  maskedHint: string;
  validatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AdminCredentialProfileView extends AdminEntityView {
  providerKey: string;
  label: string;
  status: CredentialStatus;
  currentRevisionId: string | null;
  revisions: readonly AdminCredentialRevisionView[];
}

export interface AdminProviderRouteView extends AdminEntityView {
  providerKey: string;
  modelId: string;
  endpointClass: string;
  capabilities: readonly string[];
  adapterVersion: string;
  pricingVersion: string;
  pricing: AdminJsonObject;
  policyVersion: string;
  releaseDigest: string;
  healthObservations?: readonly AdminJsonObject[];
}

export interface AdminModelUsageView {
  totals: readonly AdminJsonObject[];
  invocations: readonly AdminJsonObject[];
  budgets: readonly AdminJsonObject[];
  quotas: readonly AdminJsonObject[];
}

export enum AdminOperatorRole {
  SUPPORT = "SUPPORT",
  CONTENT_REVIEWER = "CONTENT_REVIEWER",
  LEXICON_OPERATOR = "LEXICON_OPERATOR",
  RELEASE_MANAGER = "RELEASE_MANAGER",
  MODEL_OPERATOR = "MODEL_OPERATOR",
  AGENT_RELEASE_MANAGER = "AGENT_RELEASE_MANAGER",
  SECURITY_ADMIN = "SECURITY_ADMIN",
}

export interface AdminAgentRunView {
  id: string;
  rootRunId: string;
  parentRunId: string | null;
  status: AgentRunStatus;
  requestedCapability: string;
  maxSteps: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  queuedAt: string;
  startedAt: string | null;
  waitedAt: string | null;
  completedAt: string | null;
  capabilityRelease: {
    id: string;
    capabilityKey: string;
    version: string;
    releaseDigest: string;
    status: AgentReleaseStatus;
  };
  providerRouteRelease: {
    id: string;
    providerKey: string;
    modelId: string;
    releaseDigest: string;
    status: AgentReleaseStatus;
  };
  credentialRevision: {
    id: string;
    maskedHint: string;
    validatedAt: string | null;
    revokedAt: string | null;
  };
  _count: {
    toolCalls: number;
    waits: number;
    proposals: number;
    events: number;
  };
}

export interface AdminAgentRunTerminationPreview {
  action: AdminAgentRunCommandKind;
  runId: string;
  previousStatus: AgentRunStatus;
  resultingStatus: AgentRunStatus;
  affectedRuns: number;
  reason: string;
  requiredRoles: readonly AdminOperatorRole[];
  requiresReauthentication: true;
  policyVersion: string;
  actionDigest: string;
}

export interface AdminAgentReleaseView {
  id: string;
  version: string;
  status: AgentReleaseStatus;
  releaseDigest: string;
  createdAt: string;
  capabilityKey?: string;
  toolKey?: string;
  skillKey?: string;
  evalKey?: string;
}

export interface AdminAgentReleaseCollections {
  capabilities: readonly AdminAgentReleaseView[];
  tools: readonly AdminAgentReleaseView[];
  skills: readonly AdminAgentReleaseView[];
  evals: readonly AdminAgentReleaseView[];
  evaluations: readonly Readonly<Record<string, unknown>>[];
  deployments: readonly Readonly<Record<string, unknown>>[];
  events: readonly Readonly<Record<string, unknown>>[];
}

export interface AdminAgentReleaseActionPreviewInput {
  action: AgentReleaseCommandKind;
  reason: string;
  environment?: AgentReleaseEnvironment;
  targetReleaseId?: string;
  evaluationKind?: AgentEvaluationKind;
  evalReleaseId?: string;
}

export interface AdminAgentReleaseActionCommand {
  releaseKind: AgentReleaseKind;
  releaseId: string;
  reason: string;
  actionDigest: string;
  environment?: AgentReleaseEnvironment;
  targetReleaseId?: string;
  evaluationKind?: AgentEvaluationKind;
  evalReleaseId?: string;
}

export interface AdminAgentReleaseActionPreview {
  action: AgentReleaseCommandKind;
  command: AdminAgentReleaseActionCommand;
  release: {
    id: string;
    kind: AgentReleaseKind;
    key: string;
    status: AgentReleaseStatus;
  };
  targetRelease: {
    id: string;
    kind: AgentReleaseKind;
    key: string;
    status: AgentReleaseStatus;
  } | null;
  impact: {
    action: AgentReleaseCommandKind;
    releaseKey: string;
    previousStatus: AgentReleaseStatus;
    resultingStatus: AgentReleaseStatus;
    environment: AgentReleaseEnvironment | null;
    cancelsActiveRuns: boolean;
  };
  requiredRole: AdminOperatorRole;
  requiresReauthentication: boolean;
  policyVersion: string;
  actionDigest: string;
}
