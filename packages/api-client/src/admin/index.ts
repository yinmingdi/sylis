export {
  AdminAgentRunCommandKind,
  AgentEvaluationKind,
  AgentReleaseCommandKind,
  AgentReleaseEnvironment,
  AgentReleaseKind,
  AgentReleaseStatus,
  AgentRunStatus,
} from "@sylis/agent-contracts";
export * from "./contracts";
export * from "./transport";

import type {
  AgentEvaluationKind,
  AgentReleaseEnvironment,
  AgentReleaseKind,
} from "@sylis/agent-contracts";

import type {
  AdminAuditQuery,
  AdminAuditArchiveReceipt,
  AdminAuditRetentionView,
  AdminDataAccessAuditEventView,
  AdminBuildRunInput,
  AdminCandidateRevisionInput,
  AdminBuildBudgetApprovalInput,
  AdminBuildBudgetApprovalPreview,
  AdminBuildBudgetApprovalPreviewInput,
  AdminBuildBudgetApprovalReceipt,
  AdminBuildRunReceipt,
  AdminCommandReceipt,
  AdminCreateAuditExportInput,
  AdminCreateAuditArchiveInput,
  AdminCreateAuditRetentionPolicyInput,
  AdminCreateBudgetPolicyInput,
  AdminCreateCredentialInput,
  AdminCreateLegalHoldInput,
  AdminCreateQuotaPolicyInput,
  AdminCredentialProfileView,
  AdminEntityView,
  AdminAgentReleaseActionPreview,
  AdminAgentReleaseActionPreviewInput,
  AdminAgentReleaseCollections,
  AdminAgentRunTerminationPreview,
  AdminAgentRunView,
  AdminJobView,
  AdminModelUsageView,
  AdminProviderRouteView,
  AdminOperatorRole,
  AdminOverviewView,
  AdminPublishRunInput,
  AdminRegisterSourceVersionInput,
  AdminReviewDecisionInput,
  AdminSupportGrantAccessView,
  AdminRightsDecisionInput,
  AdminRotateCredentialInput,
  AdminReleaseLegalHoldInput,
  AdminPurgeAuditArchiveInput,
  AdminAuditExportReceipt,
  AdminSecurityAuditEventView,
  AdminSessionAudience,
  AdminSessionAuthStrength,
  ProviderHealthProbeKind,
} from "./contracts";

export interface AdminProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  traceId?: string;
}

export class AdminApiProblem extends Error {
  constructor(readonly problem: AdminProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "AdminApiProblem";
  }
}

export interface AdminSessionView {
  actor: { id: string };
  session: {
    id: string;
    audience: AdminSessionAudience;
    authStrength: AdminSessionAuthStrength;
    expiresAt: string;
  };
  roles: AdminOperatorRole[];
  csrfToken: string;
}

export interface AdminMfaChallenge {
  challengeToken: string;
  methods: Array<"TOTP" | "WEBAUTHN">;
  webAuthnOptions: unknown | null;
}

export interface AdminMfaAssertion {
  challengeToken: string;
  method: "TOTP" | "WEBAUTHN";
  code?: string;
  response?: unknown;
}

export function createAdminApiClient(
  options: { baseUrl?: string; fetch?: typeof globalThis.fetch } = {},
) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  let csrfToken: string | null = null;
  const withQuery = (
    path: string,
    values: Readonly<Record<string, string | number | undefined>>,
  ) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const encoded = query.toString();
    return encoded ? `${path}?${encoded}` : path;
  };
  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> => {
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (csrfToken && method !== "GET") headers.set("X-CSRF-Token", csrfToken);
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    const response = await fetcher(`${baseUrl}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const fallback: AdminProblemDetails = {
        type: "about:blank",
        title: response.statusText || "Request failed",
        status: response.status,
      };
      throw new AdminApiProblem(
        (await response.json().catch(() => fallback)) as AdminProblemDetails,
      );
    }
    if (response.status === 204) return undefined as T;
    const result = (await response.json()) as T;
    if (result && typeof result === "object" && "csrfToken" in result)
      csrfToken = String((result as { csrfToken: unknown }).csrfToken);
    return result;
  };
  return {
    setCsrfToken(value: string | null) {
      csrfToken = value;
    },
    auth: {
      challenge: (email: string, password: string) =>
        request<AdminMfaChallenge>("POST", "/api/admin/v1/auth/challenges", {
          email,
          password,
        }),
      login: (input: {
        challengeToken: string;
        method: "TOTP" | "WEBAUTHN";
        code?: string;
        response?: unknown;
      }) =>
        request<{ csrfToken: string; expiresAt: string }>(
          "POST",
          "/api/admin/v1/auth/sessions",
          input,
        ),
      session: () =>
        request<AdminSessionView>("GET", "/api/admin/v1/auth/session"),
      beginReauthentication: (password: string) =>
        request<AdminMfaChallenge>(
          "POST",
          "/api/admin/v1/auth/session/reauthentication/challenges",
          { password },
        ),
      reauthenticate: (input: AdminMfaAssertion) =>
        request<{ reauthenticatedAt: string; validForSeconds: number }>(
          "POST",
          "/api/admin/v1/auth/session/reauthentication",
          input,
        ),
      logout: () => request<void>("DELETE", "/api/admin/v1/auth/session"),
    },
    overview: () => request<AdminOverviewView>("GET", "/api/admin/v1/overview"),
    builds: {
      list: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/lexicon/build-runs"),
      create: (input: AdminBuildRunInput, key: string) =>
        request<AdminBuildRunReceipt>(
          "POST",
          "/api/admin/v1/lexicon/build-runs",
          input,
          key,
        ),
      approveBudget: (
        runId: string,
        input: AdminBuildBudgetApprovalInput,
        key: string,
      ) =>
        request<AdminBuildBudgetApprovalReceipt>(
          "POST",
          `/api/admin/v1/lexicon/build-runs/${runId}/budget-approvals`,
          input,
          key,
        ),
      previewBudget: (
        runId: string,
        input: AdminBuildBudgetApprovalPreviewInput,
      ) =>
        request<AdminBuildBudgetApprovalPreview>(
          "POST",
          `/api/admin/v1/lexicon/build-runs/${runId}/budget-approval-previews`,
          input,
        ),
    },
    publishRuns: {
      list: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/lexicon/publish-runs"),
      create: (input: AdminPublishRunInput, key: string) =>
        request<AdminCommandReceipt>(
          "POST",
          "/api/admin/v1/lexicon/publish-runs",
          input,
          key,
        ),
    },
    releases: {
      list: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/lexicon/releases"),
      validate: (id: string, key: string) =>
        request<AdminCommandReceipt>(
          "POST",
          `/api/admin/v1/lexicon/releases/${id}/validations`,
          undefined,
          key,
        ),
      preview: (id: string) =>
        request<AdminEntityView>(
          "GET",
          `/api/admin/v1/lexicon/releases/${id}/activation-preview`,
        ),
      requestActivation: (id: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/lexicon/releases/${id}/activation-requests`,
          { reason },
        ),
      decide: (
        approvalId: string,
        decision: "APPROVE" | "REJECT",
        reason: string,
        actionDigest: string,
      ) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/lexicon/activation-requests/${approvalId}/decisions`,
          { decision, reason, actionDigest },
        ),
      activate: (id: string, approvalId: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/lexicon/releases/${id}/activate`,
          { approvalId, reason },
        ),
    },
    jobs: {
      list: () => request<AdminJobView[]>("GET", "/api/admin/v1/jobs"),
      get: (id: string) =>
        request<AdminJobView>("GET", `/api/admin/v1/jobs/${id}`),
      cancel: (id: string, reason: string) =>
        request<AdminJobView>("POST", `/api/admin/v1/jobs/${id}/cancel`, {
          reason,
        }),
      retry: (id: string, reason: string) =>
        request<AdminJobView>("POST", `/api/admin/v1/jobs/${id}/retry`, {
          reason,
        }),
    },
    sourceDatasets: {
      list: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/source-datasets"),
      rightsPolicies: () =>
        request<AdminEntityView[]>(
          "GET",
          "/api/admin/v1/source-datasets/rights-policies",
        ),
      registerVersion: (input: AdminRegisterSourceVersionInput) =>
        request<AdminEntityView>(
          "POST",
          "/api/admin/v1/source-datasets/versions",
          input,
        ),
      decideRights: (versionId: string, input: AdminRightsDecisionInput) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/source-datasets/versions/${versionId}/rights-decisions`,
          input,
        ),
      synchronizations: (versionId: string) =>
        request<AdminEntityView[]>(
          "GET",
          `/api/admin/v1/source-datasets/versions/${versionId}/synchronizations`,
        ),
      synchronize: (versionId: string, key: string) =>
        request<{ synchronizationId: string; jobId: string }>(
          "POST",
          `/api/admin/v1/source-datasets/versions/${versionId}/synchronizations`,
          undefined,
          key,
        ),
    },
    reviews: {
      batches: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/reviews/batches"),
      batch: (batchId: string) =>
        request<AdminEntityView>(
          "GET",
          `/api/admin/v1/reviews/batches/${batchId}`,
        ),
      reviseCandidate: (
        candidateId: string,
        input: AdminCandidateRevisionInput,
      ) =>
        request<AdminEntityView>(
          "PATCH",
          `/api/admin/v1/reviews/candidates/${candidateId}`,
          input,
        ),
      decide: (batchId: string, input: AdminReviewDecisionInput) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/reviews/batches/${batchId}/decisions`,
          input,
        ),
    },
    models: {
      routes: () =>
        request<AdminProviderRouteView[]>("GET", "/api/admin/v1/models/routes"),
      credentials: () =>
        request<AdminCredentialProfileView[]>(
          "GET",
          "/api/admin/v1/models/credentials",
        ),
      usage: () =>
        request<AdminModelUsageView>("GET", "/api/admin/v1/models/usage"),
      createCredential: (input: AdminCreateCredentialInput) =>
        request<AdminCredentialProfileView>(
          "POST",
          "/api/admin/v1/models/credentials",
          input,
        ),
      rotateCredential: (
        profileId: string,
        input: AdminRotateCredentialInput,
      ) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/models/credentials/${profileId}/rotations`,
          input,
        ),
      validateCredential: (
        revisionId: string,
        routeReleaseId: string,
        reason: string,
      ) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/models/credential-revisions/${revisionId}/validations`,
          { routeReleaseId, reason },
        ),
      revokeCredential: (profileId: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/models/credentials/${profileId}/revocations`,
          { reason },
        ),
      quarantineCredential: (profileId: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/models/credentials/${profileId}/quarantines`,
          { reason },
        ),
      restoreCredential: (profileId: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/models/credentials/${profileId}/restorations`,
          { reason },
        ),
      probeRoute: (
        routeReleaseId: string,
        input: {
          credentialRevisionId: string;
          probeKind: ProviderHealthProbeKind;
          reason: string;
        },
      ) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/models/routes/${routeReleaseId}/health-probes`,
          input,
        ),
      revokeRoute: (routeReleaseId: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/models/routes/${routeReleaseId}/security-revocations`,
          { reason },
        ),
      restoreRoute: (routeReleaseId: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/models/routes/${routeReleaseId}/restorations`,
          { reason },
        ),
      createBudgetPolicy: (input: AdminCreateBudgetPolicyInput) =>
        request<AdminEntityView>(
          "POST",
          "/api/admin/v1/models/budget-policies",
          input,
        ),
      createQuotaPolicy: (input: AdminCreateQuotaPolicyInput) =>
        request<AdminEntityView>(
          "POST",
          "/api/admin/v1/models/quota-policies",
          input,
        ),
    },
    agents: {
      runs: () =>
        request<AdminAgentRunView[]>("GET", "/api/admin/v1/agents/runs"),
      previewRunTermination: (runId: string, reason: string) =>
        request<AdminAgentRunTerminationPreview>(
          "POST",
          `/api/admin/v1/agents/runs/${runId}/termination-previews`,
          { reason },
        ),
      terminateRun: (
        runId: string,
        input: { reason: string; actionDigest: string },
        idempotencyKey: string,
      ) =>
        request<AdminAgentRunView>(
          "POST",
          `/api/admin/v1/agents/runs/${runId}/terminations`,
          input,
          idempotencyKey,
        ),
      releases: () =>
        request<AdminAgentReleaseCollections>(
          "GET",
          "/api/admin/v1/agents/releases",
        ),
      previewReleaseAction: (
        releaseKind: AgentReleaseKind,
        releaseId: string,
        input: AdminAgentReleaseActionPreviewInput,
      ) =>
        request<AdminAgentReleaseActionPreview>(
          "POST",
          `/api/admin/v1/agents/releases/${releaseKind}/${releaseId}/action-previews`,
          input,
        ),
      createCandidate: (
        releaseKind: AgentReleaseKind,
        releaseId: string,
        input: { reason: string; actionDigest: string },
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/agents/releases/${releaseKind}/${releaseId}/candidates`,
          input,
          idempotencyKey,
        ),
      validateRelease: (
        releaseKind: AgentReleaseKind,
        releaseId: string,
        input: { reason: string; actionDigest: string },
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/agents/releases/${releaseKind}/${releaseId}/validations`,
          input,
          idempotencyKey,
        ),
      evaluateRelease: (
        releaseKind: AgentReleaseKind,
        releaseId: string,
        input: {
          reason: string;
          actionDigest: string;
          evaluationKind: AgentEvaluationKind;
          evalReleaseId: string;
        },
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/agents/releases/${releaseKind}/${releaseId}/evaluations`,
          input,
          idempotencyKey,
        ),
      approveRelease: (
        releaseKind: AgentReleaseKind,
        releaseId: string,
        input: { reason: string; actionDigest: string },
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/agents/releases/${releaseKind}/${releaseId}/approvals`,
          input,
          idempotencyKey,
        ),
      promoteRelease: (
        releaseKind: AgentReleaseKind,
        releaseId: string,
        input: {
          reason: string;
          actionDigest: string;
          environment: AgentReleaseEnvironment;
        },
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/agents/releases/${releaseKind}/${releaseId}/promotions`,
          input,
          idempotencyKey,
        ),
      rollbackRelease: (
        releaseKind: AgentReleaseKind,
        releaseId: string,
        input: {
          reason: string;
          actionDigest: string;
          environment: AgentReleaseEnvironment;
          targetReleaseId: string;
        },
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/agents/releases/${releaseKind}/${releaseId}/rollbacks`,
          input,
          idempotencyKey,
        ),
      revokeRelease: (
        releaseKind: AgentReleaseKind,
        releaseId: string,
        input: { reason: string; actionDigest: string },
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/agents/releases/${releaseKind}/${releaseId}/revocations`,
          input,
          idempotencyKey,
        ),
    },
    userSupport: {
      users: (query: string) =>
        request<AdminEntityView[]>(
          "GET",
          withQuery("/api/admin/v1/user-support/users", { query }),
        ),
      revokeSessions: (userId: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/user-support/users/${userId}/session-revocations`,
          { reason },
        ),
      accessGrant: (grantId: string, requestId: string) =>
        request<AdminSupportGrantAccessView>(
          "POST",
          `/api/admin/v1/user-support/support-grants/${grantId}/access`,
          { requestId },
        ),
    },
    operatorRoles: {
      list: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/operator-roles"),
      grant: (input: {
        targetUserId: string;
        role: AdminOperatorRole;
        policyVersion: string;
        expiresAt: string;
        reason: string;
      }) =>
        request<AdminEntityView>("POST", "/api/admin/v1/operator-roles", input),
      revoke: (assignmentId: string, reason: string) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/operator-roles/${assignmentId}/revocations`,
          { reason },
        ),
      lockUser: (
        userId: string,
        input: { reasonCode: string; reason: string },
      ) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/user-security-locks/${userId}`,
          input,
        ),
    },
    audit: {
      securityEvents: (input: AdminAuditQuery) =>
        request<AdminSecurityAuditEventView[]>(
          "GET",
          withQuery("/api/admin/v1/audit/security-events", auditQuery(input)),
        ),
      dataAccessEvents: (input: AdminAuditQuery) =>
        request<AdminDataAccessAuditEventView[]>(
          "GET",
          withQuery(
            "/api/admin/v1/audit/data-access-events",
            auditQuery(input),
          ),
        ),
      retention: () =>
        request<AdminAuditRetentionView>(
          "GET",
          "/api/admin/v1/audit/retention",
        ),
      createRetentionPolicy: (input: AdminCreateAuditRetentionPolicyInput) =>
        request<AdminEntityView>(
          "POST",
          "/api/admin/v1/audit/retention-policies",
          input,
        ),
      createArchive: (input: AdminCreateAuditArchiveInput, key: string) =>
        request<AdminAuditArchiveReceipt>(
          "POST",
          "/api/admin/v1/audit/archives",
          input,
          key,
        ),
      purgeArchive: (
        archiveId: string,
        input: AdminPurgeAuditArchiveInput,
        key: string,
      ) =>
        request<AdminAuditArchiveReceipt>(
          "POST",
          `/api/admin/v1/audit/archives/${archiveId}/purges`,
          input,
          key,
        ),
      legalHolds: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/audit/legal-holds"),
      createLegalHold: (input: AdminCreateLegalHoldInput) =>
        request<AdminEntityView>(
          "POST",
          "/api/admin/v1/audit/legal-holds",
          input,
        ),
      releaseLegalHold: (holdId: string, input: AdminReleaseLegalHoldInput) =>
        request<AdminEntityView>(
          "POST",
          `/api/admin/v1/audit/legal-holds/${holdId}/releases`,
          input,
        ),
      exports: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/audit/exports"),
      exportArtifact: (exportId: string) =>
        request<AdminEntityView>(
          "GET",
          `/api/admin/v1/audit/exports/${exportId}`,
        ),
      createExport: (input: AdminCreateAuditExportInput, key: string) =>
        request<AdminAuditExportReceipt>(
          "POST",
          "/api/admin/v1/audit/exports",
          input,
          key,
        ),
    },
    assets: {
      list: () => request<AdminEntityView[]>("GET", "/api/admin/v1/assets"),
      get: (assetId: string) =>
        request<AdminEntityView>("GET", `/api/admin/v1/assets/${assetId}`),
    },
    deployments: {
      list: () =>
        request<AdminEntityView[]>("GET", "/api/admin/v1/deployment-releases"),
    },
  };
}

function auditQuery(input: AdminAuditQuery) {
  return {
    from: input.from,
    to: input.to,
    category: input.category,
    result: input.result,
    action: input.action,
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId,
    correlationId: input.correlationId,
    actionDigest: input.actionDigest,
    deploymentId: input.deploymentId,
    limit: input.limit,
  };
}

export type AdminApiClient = ReturnType<typeof createAdminApiClient>;

export const adminApiClient = createAdminApiClient();
