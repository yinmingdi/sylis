import type {
  AssetProcessingResult,
  AssetProcessingTask,
} from "@sylis/agent-contracts";
import type { ClaimedAttempt } from "@sylis/job-runtime";

export class AssetApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  getTask(attempt: ClaimedAttempt): Promise<AssetProcessingTask> {
    const requestId = attempt.inputRef.requestId;
    if (typeof requestId !== "string")
      throw new Error("ASSET_REQUEST_ID_REQUIRED");
    return this.request(
      `/internal/v1/asset-processing-requests/${encodeURIComponent(requestId)}`,
      { method: "GET", attempt },
    );
  }

  commit(
    attempt: ClaimedAttempt,
    task: AssetProcessingTask,
    result: AssetProcessingResult,
  ): Promise<void> {
    return this.request(
      `/internal/v1/assets/${encodeURIComponent(task.assetRevisionId)}/processing-results`,
      { method: "POST", attempt, body: { kind: attempt.kind, result } },
    );
  }

  private async request<T>(
    path: string,
    input: { method: "GET" | "POST"; attempt: ClaimedAttempt; body?: unknown },
  ): Promise<T> {
    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      method: input.method,
      headers: {
        authorization: `Bearer ${this.serviceToken}`,
        "content-type": "application/json",
        "x-job-attempt-id": input.attempt.attemptId,
        "x-job-fencing-token": input.attempt.fencingToken.toString(),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    if (!response.ok) throw new Error(`ASSET_API_HTTP_${response.status}`);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
