import { ModelOperationKind } from "@sylis/database";

export type AssetModelOperationKind =
  | typeof ModelOperationKind.EMBEDDING
  | typeof ModelOperationKind.VISION_ANALYSIS;

export class ModelGatewayClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async process(input: {
    permitId: string;
    assetRevisionId: string;
    operation: AssetModelOperationKind;
  }): Promise<Readonly<Record<string, unknown>>> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/asset-processing`,
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
    return (await response.json()) as Readonly<Record<string, unknown>>;
  }
}
