export interface EvaluationRequest {
  evaluationRunId: string;
  releaseId: string;
  suiteRef: string;
  judge: boolean;
  permitId: string;
}

export interface EvaluationResult {
  evidenceId: string;
  score: number;
  passed: boolean;
  metrics: Readonly<Record<string, number>>;
}

export class ModelGatewayClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async evaluate(input: EvaluationRequest): Promise<EvaluationResult> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/evaluations`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error(`MODEL_GATEWAY_HTTP_${response.status}`);
    return (await response.json()) as EvaluationResult;
  }
}
