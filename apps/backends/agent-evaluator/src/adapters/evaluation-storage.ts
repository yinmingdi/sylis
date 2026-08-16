import type { ClaimedAttempt } from "@sylis/job-runtime";

import type { EvaluationResult } from "./model-gateway-client";

export class EvaluationStorage {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async commit(
    attempt: ClaimedAttempt,
    result: EvaluationResult,
  ): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/agent-evaluation-evidence`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "content-type": "application/json",
          "x-job-attempt-id": attempt.attemptId,
          "x-job-fencing-token": attempt.fencingToken.toString(),
        },
        body: JSON.stringify(result),
      },
    );
    if (!response.ok) throw new Error(`AGENT_API_HTTP_${response.status}`);
  }
}
