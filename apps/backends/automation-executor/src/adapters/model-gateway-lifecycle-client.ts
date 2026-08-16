import type { ClaimedAttempt } from "@sylis/job-runtime";

export class ModelGatewayLifecycleClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async purgeExchange(input: {
    exchangeId: string;
    ownerUserId: string;
    purgeAfter: Date;
  }): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/model-exchanges/purge`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ids: [input.exchangeId],
          ownerUserId: input.ownerUserId,
          purgeAfter: input.purgeAfter.toISOString(),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`MODEL_GATEWAY_HTTP_${response.status}`);
    }
  }

  async purgeUser(requestId: string, attempt: ClaimedAttempt): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/content-deletion-requests/${encodeURIComponent(requestId)}/user-purge`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "x-job-attempt-id": attempt.attemptId,
          "x-job-fencing-token": attempt.fencingToken.toString(),
        },
      },
    );
    if (!response.ok) {
      throw new Error(`MODEL_GATEWAY_HTTP_${response.status}`);
    }
  }

  async purgeAsset(requestId: string, attempt: ClaimedAttempt): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/content-deletion-requests/${encodeURIComponent(requestId)}/asset-purge`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "x-job-attempt-id": attempt.attemptId,
          "x-job-fencing-token": attempt.fencingToken.toString(),
        },
      },
    );
    if (!response.ok) {
      throw new Error(`MODEL_GATEWAY_HTTP_${response.status}`);
    }
  }
}
