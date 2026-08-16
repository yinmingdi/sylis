import type { ClaimedAttempt } from "@sylis/job-runtime";

export class AutomationOwnerClient {
  private readonly agentApiUrl: string;
  private readonly apiUrl: string;

  constructor(
    agentApiUrl: string,
    apiUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.agentApiUrl = agentApiUrl.replace(/\/+$/, "");
    this.apiUrl = apiUrl.replace(/\/+$/, "");
  }

  async purgeSession(
    requestId: string,
    attempt: ClaimedAttempt,
  ): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.agentApiUrl}/internal/v1/content-deletion-requests/${encodeURIComponent(requestId)}/session-purge`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "content-type": "application/json",
          "x-job-attempt-id": attempt.attemptId,
          "x-job-fencing-token": attempt.fencingToken.toString(),
        },
      },
    );
    if (!response.ok) throw new Error(`AGENT_API_HTTP_${response.status}`);
  }

  purgeAgentUser(requestId: string, attempt: ClaimedAttempt): Promise<void> {
    return this.purgeUserAt(this.agentApiUrl, "AGENT_API", requestId, attempt);
  }

  purgeIdentityUser(requestId: string, attempt: ClaimedAttempt): Promise<void> {
    return this.purgeUserAt(this.apiUrl, "API", requestId, attempt);
  }

  private async purgeUserAt(
    baseUrl: string,
    service: string,
    requestId: string,
    attempt: ClaimedAttempt,
  ): Promise<void> {
    const response = await this.fetchImplementation(
      `${baseUrl}/internal/v1/content-deletion-requests/${encodeURIComponent(requestId)}/user-purge`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "x-job-attempt-id": attempt.attemptId,
          "x-job-fencing-token": attempt.fencingToken.toString(),
        },
      },
    );
    if (!response.ok) throw new Error(`${service}_HTTP_${response.status}`);
  }
}
