import { Injectable, type Provider } from "@nestjs/common";

import { ApiConfig } from "../../config/api.config";

@Injectable()
export class AgentApiClient {
  constructor(
    private readonly config: ApiConfig,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  diagnosticBundleSupportView(input: {
    grantId: string;
    requestId: string;
    operatorUserId: string;
    ownerUserId: string;
    bundleId: string;
    revisionId: string;
  }): Promise<unknown> {
    return this.get(
      `/internal/v1/diagnostic-bundles/${encodeURIComponent(input.bundleId)}/revisions/${encodeURIComponent(input.revisionId)}/support-view`,
      input,
    );
  }

  assetRevisionSupportView(input: {
    grantId: string;
    requestId: string;
    operatorUserId: string;
    ownerUserId: string;
    assetId: string;
    revisionId: string;
  }): Promise<unknown> {
    return this.get(
      `/internal/v1/assets/${encodeURIComponent(input.assetId)}/revisions/${encodeURIComponent(input.revisionId)}/support-view`,
      input,
    );
  }

  private async get(
    path: string,
    input: {
      grantId: string;
      requestId: string;
      operatorUserId: string;
      ownerUserId: string;
    },
  ): Promise<unknown> {
    const response = await this.fetchImplementation(
      `${this.config.agentApiUrl}${path}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.config.agentApiServiceToken}`,
          "x-support-grant-id": input.grantId,
          "x-support-access-request-id": `resource-read:${input.requestId}`,
          "x-support-operator-id": input.operatorUserId,
          "x-content-owner-id": input.ownerUserId,
        },
      },
    );
    if (!response.ok) throw new Error(`AGENT_API_HTTP_${response.status}`);
    return response.json();
  }
}

export const AGENT_API_CLIENT_PROVIDER: Provider = {
  provide: AgentApiClient,
  inject: [ApiConfig],
  useFactory: (config: ApiConfig) => new AgentApiClient(config),
};
