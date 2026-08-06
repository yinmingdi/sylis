export * from "./transport";

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
  actor: { id: string; locale: string; timezone: string };
  session: {
    id: string;
    audience: "ADMIN";
    authStrength: string;
    expiresAt: string;
  };
  roles: Array<
    "SUPPORT" | "CONTENT_REVIEWER" | "RELEASE_MANAGER" | "SECURITY_ADMIN"
  >;
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
      beginReauthentication: () =>
        request<AdminMfaChallenge>(
          "POST",
          "/api/admin/v1/auth/session/reauthentication/challenges",
        ),
      reauthenticate: (input: AdminMfaAssertion) =>
        request<{ reauthenticatedAt: string; validForSeconds: number }>(
          "POST",
          "/api/admin/v1/auth/session/reauthentication",
          input,
        ),
      logout: () => request<void>("DELETE", "/api/admin/v1/auth/session"),
    },
    dashboard: () => request<unknown>("GET", "/api/admin/v1/dashboard"),
    builds: {
      list: () => request<unknown[]>("GET", "/api/admin/v1/build-runs"),
      create: (input: unknown, key: string) =>
        request<unknown>("POST", "/api/admin/v1/build-runs", input, key),
    },
    imports: {
      list: () => request<unknown[]>("GET", "/api/admin/v1/import-jobs"),
      create: (input: unknown, key: string) =>
        request<unknown>("POST", "/api/admin/v1/import-jobs", input, key),
    },
    releases: {
      list: () => request<unknown[]>("GET", "/api/admin/v1/lexicon-releases"),
      validate: (id: string, key: string) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/lexicon-releases/${id}/validation-jobs`,
          undefined,
          key,
        ),
      preview: (id: string) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/lexicon-releases/${id}/activation-previews`,
        ),
      requestActivation: (id: string, reason: string) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/lexicon-releases/${id}/activation-requests`,
          { reason },
        ),
      activate: (id: string, approvalId: string, reason: string) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/lexicon-releases/${id}/activate?approvalId=${encodeURIComponent(approvalId)}`,
          { reason },
        ),
    },
    approvals: {
      decide: (id: string, decision: "APPROVE" | "REJECT", reason: string) =>
        request<unknown>("POST", `/api/admin/v1/approvals/${id}/decisions`, {
          decision,
          reason,
        }),
    },
    jobs: {
      list: () => request<unknown[]>("GET", "/api/admin/v1/jobs"),
      get: (id: string) => request<unknown>("GET", `/api/admin/v1/jobs/${id}`),
      cancel: (id: string) =>
        request<void>("DELETE", `/api/admin/v1/jobs/${id}`),
      resume: (id: string, reason: string) =>
        request<unknown>("POST", `/api/admin/v1/jobs/${id}/resume`, { reason }),
      eventsUrl: (id: string, after = 0) =>
        `${baseUrl}/api/admin/v1/jobs/${id}/events?after=${after}`,
    },
    sourceRights: () =>
      request<unknown[]>("GET", "/api/admin/v1/source-rights"),
    sources: {
      synchronize: (sourceKind: "REDDIT", key: string) =>
        request<{ synchronizationId: string; jobId: string }>(
          "POST",
          "/api/admin/v1/source-synchronizations",
          { sourceKind },
          key,
        ),
      withdrawReddit: (postId: string, reason: string) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/sources/reddit/${encodeURIComponent(postId)}/withdraw`,
          { reason },
        ),
    },
    audit: () => request<unknown[]>("GET", "/api/admin/v1/audit-events"),
    aiUsage: () => request<unknown>("GET", "/api/admin/v1/ai-usage"),
    runtimeAi: {
      get: () => request<unknown>("GET", "/api/admin/v1/runtime-ai-control"),
      set: (enabled: boolean, reason: string) =>
        request<unknown>("POST", "/api/admin/v1/runtime-ai-control", {
          enabled,
          reason,
        }),
    },
    users: {
      list: (query = "") =>
        request<unknown[]>(
          "GET",
          `/api/admin/v1/users${query ? `?query=${encodeURIComponent(query)}` : ""}`,
        ),
      setStatus: (id: string, status: "ACTIVE" | "SUSPENDED", reason: string) =>
        request<unknown>("POST", `/api/admin/v1/users/${id}/status`, {
          status,
          reason,
        }),
      adminSessions: (id: string) =>
        request<unknown[]>("GET", `/api/admin/v1/users/${id}/admin-sessions`),
      revokeAdminSession: (userId: string, sessionId: string, reason: string) =>
        request<unknown>(
          "POST",
          `/api/admin/v1/users/${userId}/admin-sessions/${sessionId}/revoke`,
          { reason },
        ),
    },
    deployments: {
      list: () =>
        request<unknown[]>("GET", "/api/admin/v1/deployment-releases"),
      record: (input: unknown, key: string) =>
        request<unknown>(
          "POST",
          "/api/admin/v1/deployment-releases",
          input,
          key,
        ),
    },
  };
}

export type AdminApiClient = ReturnType<typeof createAdminApiClient>;

export const adminApiClient = createAdminApiClient();
