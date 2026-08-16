import type {
  AgentArtifactDocument,
  AgentProposalDecision,
} from "@sylis/agent-contracts";
import type { AssetPurpose } from "@sylis/agent-contracts";

import type {
  AgentArtifactSummary,
  AgentArtifactRevisionView,
  AgentArtifactView,
  AgentArtifactAcceptancePreview,
  AgentAssetRevisionView,
  AgentAssetView,
  AgentCapabilityView,
  AgentDiagnosticBundleRevisionView,
  AgentDiagnosticBundleView,
  AgentDiagnosticReference,
  AgentMessageView,
  AgentMemoryCardView,
  AgentInstructionSubmissionView,
  AgentProblemDetails,
  AgentProposalView,
  AgentRunView,
  AgentSessionView,
  AgentUsageView,
  AgentUploadIntentView,
  SubmitAgentInstructionInput,
} from "./contracts";

export class AgentApiProblem extends Error {
  constructor(readonly problem: AgentProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "AgentApiProblem";
  }
}

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface AgentClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createAgentClient(options: AgentClientOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  let csrfToken: string | null = null;

  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> => {
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (mutationMethods.has(method) && csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    const response = await fetcher(`${baseUrl}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const fallback: AgentProblemDetails = {
        type: "about:blank",
        title: response.statusText || "Agent request failed",
        status: response.status,
      };
      const problem = (await response
        .json()
        .catch(() => fallback)) as AgentProblemDetails;
      throw new AgentApiProblem(problem);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  return {
    setCsrfToken(value: string | null) {
      csrfToken = value;
    },
    sessions: {
      list: () => request<AgentSessionView[]>("GET", "/api/agent/v1/sessions"),
      get: (sessionId: string) =>
        request<AgentSessionView>("GET", `/api/agent/v1/sessions/${sessionId}`),
      create: (title: string) =>
        request<AgentSessionView>("POST", "/api/agent/v1/sessions", { title }),
      update: (
        sessionId: string,
        input: { title?: string; archived?: boolean },
      ) =>
        request<AgentSessionView>(
          "PATCH",
          `/api/agent/v1/sessions/${sessionId}`,
          input,
        ),
      remove: (sessionId: string) =>
        request<void>("DELETE", `/api/agent/v1/sessions/${sessionId}`),
      messages: (sessionId: string, after = 0) =>
        request<AgentMessageView[]>(
          "GET",
          `/api/agent/v1/sessions/${sessionId}/messages?after=${after}`,
        ),
      runs: (sessionId: string) =>
        request<AgentRunView[]>(
          "GET",
          `/api/agent/v1/sessions/${sessionId}/runs`,
        ),
      submitInstruction: (
        sessionId: string,
        input: SubmitAgentInstructionInput,
      ) =>
        request<AgentInstructionSubmissionView>(
          "POST",
          `/api/agent/v1/sessions/${sessionId}/instructions`,
          input,
          input.idempotencyKey,
        ),
      eventsUrl: (sessionId: string, after = 0) =>
        `${baseUrl}/api/agent/v1/sessions/${sessionId}/events?after=${after}`,
    },
    runs: {
      get: (runId: string) =>
        request<AgentRunView>("GET", `/api/agent/v1/runs/${runId}`),
      cancel: (runId: string) =>
        request<AgentRunView>("POST", `/api/agent/v1/runs/${runId}/cancel`),
      retry: (runId: string, idempotencyKey: string) =>
        request<AgentRunView>(
          "POST",
          `/api/agent/v1/runs/${runId}/retry`,
          { idempotencyKey },
          idempotencyKey,
        ),
      respondToWait: (
        runId: string,
        waitId: string,
        response: Readonly<Record<string, unknown>>,
      ) =>
        request<unknown>(
          "POST",
          `/api/agent/v1/runs/${runId}/wait-conditions/${waitId}/responses`,
          response,
        ),
    },
    proposals: {
      get: (proposalId: string) =>
        request<AgentProposalView>(
          "GET",
          `/api/agent/v1/proposals/${proposalId}`,
        ),
      decide: (
        proposalId: string,
        decision: AgentProposalDecision,
        actionDigest: string,
      ) =>
        request<AgentProposalView>(
          "POST",
          `/api/agent/v1/proposals/${proposalId}/decisions`,
          { decision, actionDigest },
        ),
    },
    artifacts: {
      list: () =>
        request<AgentArtifactSummary[]>("GET", "/api/agent/v1/artifacts"),
      get: (artifactId: string) =>
        request<AgentArtifactView>(
          "GET",
          `/api/agent/v1/artifacts/${artifactId}`,
        ),
      revise: (
        artifactId: string,
        document: AgentArtifactDocument,
        idempotencyKey: string,
      ) =>
        request<AgentArtifactRevisionView>(
          "POST",
          `/api/agent/v1/artifacts/${artifactId}/revisions`,
          { document, idempotencyKey },
          idempotencyKey,
        ),
      acceptancePreview: (artifactId: string, revisionId?: string) =>
        request<AgentArtifactAcceptancePreview>(
          "GET",
          `/api/agent/v1/artifacts/${artifactId}/accept-as-asset${revisionId ? `?revisionId=${encodeURIComponent(revisionId)}` : ""}`,
        ),
      acceptAsAsset: (
        artifactId: string,
        input: {
          artifactRevisionId?: string;
          actionDigest: string;
          idempotencyKey: string;
        },
      ) =>
        request<AgentAssetView>(
          "POST",
          `/api/agent/v1/artifacts/${artifactId}/accept-as-asset`,
          input,
          input.idempotencyKey,
        ),
    },
    assets: {
      list: () => request<AgentAssetView[]>("GET", "/api/agent/v1/assets"),
      get: (assetId: string) =>
        request<AgentAssetView>("GET", `/api/agent/v1/assets/${assetId}`),
      revision: (assetId: string, revisionId: string) =>
        request<AgentAssetRevisionView>(
          "GET",
          `/api/agent/v1/assets/${assetId}/revisions/${revisionId}`,
        ),
      createUploadIntent: (input: {
        filename: string;
        byteSize: number;
        contentHash: string;
        mimeType: string;
        purpose: AssetPurpose;
      }) =>
        request<AgentUploadIntentView>(
          "POST",
          "/api/agent/v1/assets/upload-intents",
          input,
        ),
      finalize: (assetId: string, intentId: string) =>
        request<{
          assetId: string;
          revisionId: string;
          jobId: string;
          status: string;
        }>("POST", `/api/agent/v1/assets/${assetId}/finalize`, { intentId }),
      remove: (assetId: string) =>
        request<void>("DELETE", `/api/agent/v1/assets/${assetId}`),
    },
    memory: {
      list: () =>
        request<AgentMemoryCardView[]>("GET", "/api/agent/v1/memory-cards"),
      update: (
        memoryCardId: string,
        input: {
          subject?: string;
          claim?: string;
          confidence?: number;
          idempotencyKey: string;
        },
      ) =>
        request<AgentMemoryCardView>(
          "PATCH",
          `/api/agent/v1/memory-cards/${memoryCardId}`,
          input,
          input.idempotencyKey,
        ),
      suppress: (memoryCardId: string, reason?: string) =>
        request<void>("DELETE", `/api/agent/v1/memory-cards/${memoryCardId}`, {
          reason,
        }),
    },
    modelExchanges: {
      remove: (exchangeId: string) =>
        request<void>("DELETE", `/api/agent/v1/model-exchanges/${exchangeId}`),
    },
    diagnostics: {
      list: () =>
        request<AgentDiagnosticBundleView[]>(
          "GET",
          "/api/agent/v1/diagnostic-bundles",
        ),
      get: (bundleId: string) =>
        request<AgentDiagnosticBundleView>(
          "GET",
          `/api/agent/v1/diagnostic-bundles/${bundleId}`,
        ),
      create: (
        selectedRefs: readonly AgentDiagnosticReference[],
        idempotencyKey: string,
      ) =>
        request<AgentDiagnosticBundleView>(
          "POST",
          "/api/agent/v1/diagnostic-bundles",
          { selectedRefs, idempotencyKey },
          idempotencyKey,
        ),
      revise: (
        bundleId: string,
        input: {
          selectedRefs?: readonly AgentDiagnosticReference[];
          redactedPayload?: unknown;
          idempotencyKey: string;
        },
      ) =>
        request<AgentDiagnosticBundleRevisionView>(
          "POST",
          `/api/agent/v1/diagnostic-bundles/${bundleId}/revisions`,
          input,
          input.idempotencyKey,
        ),
      confirm: (bundleId: string, revisionId: string) =>
        request<AgentDiagnosticBundleRevisionView>(
          "POST",
          `/api/agent/v1/diagnostic-bundles/${bundleId}/revisions/${revisionId}/confirm`,
        ),
    },
    capabilities: () =>
      request<AgentCapabilityView[]>("GET", "/api/agent/v1/capabilities"),
    usage: () => request<AgentUsageView[]>("GET", "/api/agent/v1/usage"),
  };
}

export type AgentClient = ReturnType<typeof createAgentClient>;
