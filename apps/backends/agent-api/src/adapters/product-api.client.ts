import { Injectable, type Provider } from "@nestjs/common";
import type {
  AgentArtifactRevisionSnapshot,
  AgentOwnerCommandKind,
  AgentResourceRef,
} from "@sylis/agent-contracts";

import { AgentApiConfig } from "../config/agent-api.config";

@Injectable()
export class ProductApiClient {
  constructor(
    private readonly config: AgentApiConfig,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  commitOwnerCommand(input: {
    userId: string;
    proposalId: string;
    commandKind: AgentOwnerCommandKind;
    target: AgentResourceRef;
    payload: Readonly<Record<string, unknown>>;
    artifact?: AgentArtifactRevisionSnapshot;
    actionDigest: string;
    idempotencyKey: string;
    commitAttemptId: string;
  }): Promise<Readonly<Record<string, unknown>>> {
    return this.post("agent-owner-commands", input);
  }

  contextEvidence(input: {
    userId: string;
    ref: AgentResourceRef;
  }): Promise<{ label: string; content: string }> {
    return this.post("agent-context/evidence", input);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImplementation(
      `${this.config.productApiUrl}/internal/v1/${path}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.productApiServiceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error(`PRODUCT_API_HTTP_${response.status}`);
    return (await response.json()) as T;
  }
}

export const PRODUCT_API_CLIENT_PROVIDER: Provider = {
  provide: ProductApiClient,
  inject: [AgentApiConfig],
  useFactory: (config: AgentApiConfig) => new ProductApiClient(config),
};
