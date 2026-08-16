import type { DataExportCategory } from "@sylis/job-contracts";

import type {
  AddNotebookItemInput,
  ConsentRecordInput,
  ExerciseResponse,
  ExerciseView,
  LexiconEntryView,
  LexiconHeadwordView,
  LexiconSenseView,
  PedagogicalMaterialView,
  JobView,
  NotebookInput,
  ProblemDetails,
  ReleaseEnvelope,
  RecordReadingActivityInput,
  ReadingCollectionItemView,
  ReadingHistoryItemView,
  ResolveReadingSelectionInput,
  SaveReadingCollectionItemInput,
  SearchResult,
  SessionView,
  StudyItemProgressView,
  SupportGrantPreview,
  SupportGrantTargetInput,
  SupportGrantView,
  UpdateStudyProgressInput,
  UpdateNotebookItemInput,
  UserActor,
  UserModelCredentialView,
} from "./contracts";

export class ApiProblem extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "ApiProblem";
  }
}

const mutation = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(options: ClientOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  let csrfToken: string | null = null;

  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
    requestOptions: { idempotencyKey?: string } = {},
  ): Promise<T> => {
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (mutation.has(method) && csrfToken)
      headers.set("X-CSRF-Token", csrfToken);
    if (requestOptions.idempotencyKey) {
      headers.set("Idempotency-Key", requestOptions.idempotencyKey);
    }
    const response = await fetcher(`${baseUrl}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const fallback: ProblemDetails = {
        type: "about:blank",
        title: response.statusText || "Request failed",
        status: response.status,
      };
      const problem = (await response
        .json()
        .catch(() => fallback)) as ProblemDetails;
      throw new ApiProblem(problem);
    }
    if (response.status === 204) return undefined as T;
    const value = (await response.json()) as T;
    if (value && typeof value === "object" && "csrfToken" in value) {
      csrfToken = String((value as { csrfToken: unknown }).csrfToken);
    }
    return value;
  };

  const releaseData = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ReleaseEnvelope<T>> =>
    request<ReleaseEnvelope<T>>(method, path, body);

  return {
    setCsrfToken(value: string | null) {
      csrfToken = value;
    },
    identity: {
      session: () => request<SessionView>("GET", "/api/v1/auth/session"),
      login: (input: { email: string; password: string }) =>
        request<{ csrfToken: string; expiresAt: string }>(
          "POST",
          "/api/v1/auth/sessions",
          input,
        ),
      logout: () => request<void>("DELETE", "/api/v1/auth/session"),
      reauthenticate: (password: string) =>
        request<{
          csrfToken: string;
          expiresAt: string;
          validForSeconds: number;
        }>("POST", "/api/v1/auth/session/re-authentication", { password }),
      requestRegistration: (email: string) =>
        request<{ accepted: true }>(
          "POST",
          "/api/v1/auth/registration-challenges",
          { email },
        ),
      requestPasswordRecovery: (email: string) =>
        request<{ accepted: true }>(
          "POST",
          "/api/v1/auth/password-recovery-challenges",
          { email },
        ),
      resetPassword: (input: { token: string; password: string }) =>
        request<void>("POST", "/api/v1/auth/password-resets", input),
      register: (input: {
        token: string;
        displayName: string;
        password: string;
        timezone: string;
      }) =>
        request<{ csrfToken: string; expiresAt: string }>(
          "POST",
          "/api/v1/auth/register",
          input,
        ),
      me: () => request<UserActor>("GET", "/api/v1/users/me"),
      updateMe: (input: {
        locale: string;
        timezone: string;
        displayName?: string;
        email?: string;
        avatarUrl?: string;
      }) => request<UserActor>("PATCH", "/api/v1/users/me", input),
      changePassword: (newPassword: string) =>
        request<void>("PATCH", "/api/v1/users/me/password", { newPassword }),
      requestAccountDeletion: (idempotencyKey: string) =>
        request<{
          requestId: string;
          status: string;
          hiddenAt: string;
          purgeAfter: string;
        }>("POST", "/api/v1/users/me/deletion-requests", undefined, {
          idempotencyKey,
        }),
      sessions: () => request<unknown[]>("GET", "/api/v1/users/me/sessions"),
      revokeSession: (id: string) =>
        request<void>("DELETE", `/api/v1/users/me/sessions/${id}`),
      consents: () => request<unknown[]>("GET", "/api/v1/users/me/consents"),
      recordConsent: (input: ConsentRecordInput) =>
        request<unknown>("POST", "/api/v1/users/me/consent-records", input),
      beginPasskeyEnrollment: () =>
        request<{ challengeId: string; options: unknown }>(
          "POST",
          "/api/v1/auth/mfa/webauthn/enrollments",
        ),
      completePasskeyEnrollment: (input: {
        challengeId: string;
        label: string;
        response: unknown;
      }) =>
        request<unknown>(
          "POST",
          "/api/v1/auth/mfa/webauthn/enrollments/verify",
          input,
        ),
    },
    modelCredentials: {
      list: () =>
        request<UserModelCredentialView[]>(
          "GET",
          "/api/v1/users/me/model-credentials",
        ),
      create: (
        input: {
          providerKey: string;
          routeReleaseId: string;
          label: string;
          secret: string;
          expiresAt?: string;
        },
        idempotencyKey: string,
      ) =>
        request<UserModelCredentialView>(
          "POST",
          "/api/v1/users/me/model-credentials",
          input,
          { idempotencyKey },
        ),
      rotate: (
        profileId: string,
        input: {
          routeReleaseId: string;
          secret: string;
          expiresAt?: string;
        },
        idempotencyKey: string,
      ) =>
        request<UserModelCredentialView>(
          "POST",
          `/api/v1/users/me/model-credentials/${profileId}/rotations`,
          input,
          { idempotencyKey },
        ),
      revoke: (profileId: string) =>
        request<UserModelCredentialView>(
          "DELETE",
          `/api/v1/users/me/model-credentials/${profileId}`,
        ),
    },
    supportGrants: {
      list: () =>
        request<SupportGrantView[]>("GET", "/api/v1/users/me/support-grants"),
      preview: (
        input: SupportGrantTargetInput & { durationSeconds?: number },
      ) =>
        request<SupportGrantPreview>(
          "POST",
          "/api/v1/users/me/support-grants/previews",
          input,
        ),
      create: (input: SupportGrantPreview, idempotencyKey: string) =>
        request<SupportGrantView>(
          "POST",
          "/api/v1/users/me/support-grants",
          { ...input, idempotencyKey },
          { idempotencyKey },
        ),
      revoke: (grantId: string) =>
        request<void>("DELETE", "/api/v1/users/me/support-grants/" + grantId),
    },
    lexicon: {
      search: (query: string, limit = 20) =>
        releaseData<{ headwords: SearchResult[]; collocations: unknown[] }>(
          "GET",
          `/api/v1/lexicon/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        ),
      headword: (id: string) =>
        releaseData<LexiconHeadwordView>(
          "GET",
          `/api/v1/lexicon/headwords/${id}`,
        ),
      entry: (id: string) =>
        releaseData<LexiconEntryView>("GET", `/api/v1/lexicon/entries/${id}`),
      sense: (id: string) =>
        releaseData<LexiconSenseView>("GET", `/api/v1/lexicon/senses/${id}`),
      entryMaterials: (id: string, kind?: string) =>
        releaseData<PedagogicalMaterialView[]>(
          "GET",
          `/api/v1/lexicon/entries/${id}/materials${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`,
        ),
      senseMaterials: (id: string, kind?: string) =>
        releaseData<PedagogicalMaterialView[]>(
          "GET",
          `/api/v1/lexicon/senses/${id}/materials${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`,
        ),
    },
    books: {
      list: () => releaseData<unknown[]>("GET", "/api/v1/vocabulary-books"),
      edition: (bookId: string, editionId: string, after = -1, limit = 100) =>
        releaseData<unknown>(
          "GET",
          `/api/v1/vocabulary-books/${bookId}/editions/${editionId}?after=${after}&limit=${limit}`,
        ),
      enrollments: () => request<unknown[]>("GET", "/api/v1/study/enrollments"),
      enroll: (input: {
        bookId: string;
        editionId: string;
        dailyNewLimit: number;
      }) => request<unknown>("POST", "/api/v1/study/enrollments", input),
      updateEnrollment: (id: string, input: { dailyNewLimit?: number }) =>
        request<unknown>("PATCH", `/api/v1/study/enrollments/${id}`, input),
      migrateEnrollment: (id: string, editionId: string, confirm: boolean) =>
        request<unknown>("POST", `/api/v1/study/enrollments/${id}/migrate`, {
          editionId,
          confirm,
        }),
    },
    study: {
      today: () => request<unknown>("GET", "/api/v1/study/today"),
      generateToday: (idempotencyKey: string) =>
        request<{ id: string }>(
          "POST",
          "/api/v1/study/today/generation-jobs",
          undefined,
          { idempotencyKey },
        ),
      objective: (id: string) =>
        request<unknown>("GET", `/api/v1/study/objectives/${id}`),
      updateProgress: (planItemId: string, input: UpdateStudyProgressInput) =>
        request<StudyItemProgressView>(
          "PATCH",
          `/api/v1/study/plan-items/${planItemId}/progress`,
          input,
        ),
      stats: () => request<unknown>("GET", "/api/v1/study/stats"),
      createAttempt: (planItemId: string, idempotencyKey: string) =>
        request<ExerciseView>(
          "POST",
          "/api/v1/study/attempts",
          { planItemId },
          { idempotencyKey },
        ),
      submitResponse: (
        attemptId: string,
        response: ExerciseResponse,
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/v1/study/attempts/${attemptId}/responses`,
          response,
          { idempotencyKey },
        ),
      submitReview: (
        attemptId: string,
        rating: number,
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          "/api/v1/study/reviews",
          { attemptId, rating },
          { idempotencyKey },
        ),
    },
    assessments: {
      blueprints: () =>
        request<unknown[]>("GET", "/api/v1/assessments/blueprints"),
      createSession: (blueprintRevisionId: string, idempotencyKey: string) =>
        request<unknown>(
          "POST",
          "/api/v1/assessments/sessions",
          { blueprintRevisionId },
          { idempotencyKey },
        ),
      session: (id: string) =>
        request<unknown>("GET", `/api/v1/assessments/sessions/${id}`),
      respond: (
        id: string,
        input: { attemptId: string; response: ExerciseResponse },
        idempotencyKey: string,
      ) =>
        request<unknown>(
          "POST",
          `/api/v1/assessments/sessions/${id}/responses`,
          input,
          { idempotencyKey },
        ),
      submit: (id: string) =>
        request<unknown>("POST", `/api/v1/assessments/sessions/${id}/submit`),
      result: (id: string) =>
        request<unknown>("GET", `/api/v1/assessments/sessions/${id}/result`),
      history: (limit = 20) =>
        request<unknown[]>("GET", `/api/v1/assessments/history?limit=${limit}`),
    },
    notebooks: {
      list: () => request<unknown[]>("GET", "/api/v1/notebooks"),
      get: (id: string) => request<unknown>("GET", `/api/v1/notebooks/${id}`),
      create: (input: NotebookInput) =>
        request<unknown>("POST", "/api/v1/notebooks", input),
      update: (id: string, input: NotebookInput) =>
        request<unknown>("PATCH", `/api/v1/notebooks/${id}`, input),
      remove: (id: string) =>
        request<void>("DELETE", `/api/v1/notebooks/${id}`),
      items: (id: string) =>
        request<unknown[]>("GET", `/api/v1/notebooks/${id}/items`),
      add: (id: string, input: AddNotebookItemInput) =>
        request<unknown>("POST", `/api/v1/notebooks/${id}/items`, input),
      updateItem: (
        id: string,
        itemId: string,
        input: UpdateNotebookItemInput,
      ) =>
        request<unknown>(
          "PATCH",
          `/api/v1/notebooks/${id}/items/${itemId}`,
          input,
        ),
      removeItem: (id: string, itemId: string) =>
        request<void>("DELETE", `/api/v1/notebooks/${id}/items/${itemId}`),
    },
    reading: {
      document: (id: string) =>
        request<unknown>("GET", `/api/v1/reading/documents/${id}`),
      history: () =>
        request<ReadingHistoryItemView[]>("GET", "/api/v1/reading/history"),
      library: () =>
        request<ReadingCollectionItemView[]>(
          "GET",
          "/api/v1/reading/collections/library/items",
        ),
      save: (input: SaveReadingCollectionItemInput) =>
        request<ReadingCollectionItemView>(
          "POST",
          "/api/v1/reading/collections/library/items",
          input,
        ),
      unsave: (id: string) =>
        request<void>(
          "DELETE",
          `/api/v1/reading/collections/library/items/${id}`,
        ),
      annotations: (revisionId: string) =>
        request<unknown[]>(
          "GET",
          `/api/v1/reading/revisions/${revisionId}/annotations`,
        ),
      targets: (revisionId: string) =>
        request<unknown[]>(
          "GET",
          `/api/v1/reading/revisions/${revisionId}/targets`,
        ),
      selectTargets: (revisionId: string) =>
        request<unknown[]>(
          "POST",
          `/api/v1/reading/revisions/${revisionId}/targets/select`,
        ),
      resolveSelection: (
        revisionId: string,
        input: ResolveReadingSelectionInput,
      ) =>
        request<unknown>(
          "POST",
          `/api/v1/reading/revisions/${revisionId}/resolve-selection`,
          input,
        ),
      recordActivity: (input: RecordReadingActivityInput) =>
        request<unknown>("POST", "/api/v1/reading/activities", input),
    },
    reddit: {
      feed: (subreddit?: string) =>
        request<unknown[]>(
          "GET",
          `/api/v1/explore/reddit/feed${subreddit ? `?subreddit=${encodeURIComponent(subreddit)}` : ""}`,
        ),
      post: (id: string) =>
        request<unknown>(
          "GET",
          `/api/v1/explore/reddit/posts/${encodeURIComponent(id)}`,
        ),
    },
    jobs: {
      get: (id: string) => request<JobView>("GET", `/api/v1/jobs/${id}`),
      cancel: (id: string) => request<void>("DELETE", `/api/v1/jobs/${id}`),
      eventsUrl: (id: string, after = 0) =>
        `${baseUrl}/api/v1/jobs/${id}/events?after=${after}`,
    },
    data: {
      requestExport: (
        scope: readonly DataExportCategory[],
        idempotencyKey: string,
      ) =>
        request<{ requestId: string; jobId: string }>(
          "POST",
          "/api/v1/users/me/data-exports",
          { scope },
          { idempotencyKey },
        ),
      exportStatus: (requestId: string) =>
        request<unknown>("GET", `/api/v1/users/me/data-exports/${requestId}`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
