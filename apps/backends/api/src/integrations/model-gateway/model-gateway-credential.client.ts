import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
  type Provider,
} from "@nestjs/common";
import type { CredentialStatus, CredentialType } from "@sylis/database";

import { ApiConfig } from "../../config/api.config";
import type { ActorContext } from "../../platform/auth/actor-context";

export interface UserModelCredentialRevisionView {
  id: string;
  revisionNo: number;
  credentialType: CredentialType;
  status: CredentialStatus;
  maskedHint: string;
  metadata: Record<string, unknown>;
  validatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface UserModelCredentialView {
  id: string;
  providerKey: string;
  label: string;
  status: CredentialStatus;
  currentRevisionId: string | null;
  createdAt: string;
  revisions: UserModelCredentialRevisionView[];
}

export interface UserModelCredentialInput {
  providerKey: string;
  routeReleaseId: string;
  label: string;
  credentialType: CredentialType;
  secret: string;
  expiresAt?: string;
  idempotencyKey: string;
}

@Injectable()
export class ModelGatewayCredentialClient {
  constructor(
    private readonly config: ApiConfig,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  list(actor: ActorContext) {
    return this.post<UserModelCredentialView[]>("query", actor);
  }

  create(actor: ActorContext, credential: UserModelCredentialInput) {
    return this.post<UserModelCredentialView>("", actor, { credential });
  }

  rotate(
    actor: ActorContext,
    profileId: string,
    credential: Omit<UserModelCredentialInput, "providerKey" | "label">,
  ) {
    return this.post<UserModelCredentialView>(
      `${encodeURIComponent(profileId)}/rotations`,
      actor,
      { credential },
    );
  }

  revoke(actor: ActorContext, profileId: string) {
    return this.post<UserModelCredentialView>(
      `${encodeURIComponent(profileId)}/revocations`,
      actor,
    );
  }

  private async post<T>(
    path: string,
    actor: ActorContext,
    input: Record<string, unknown> = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImplementation(
        new URL(
          `/internal/v1/user-credentials${path ? `/${path}` : ""}`,
          this.config.modelGatewayUrl,
        ),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.modelGatewayServiceToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            actor: { userId: actor.userId, sessionId: actor.sessionId },
            ...input,
          }),
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch {
      throw new ServiceUnavailableException("MODEL_GATEWAY_UNAVAILABLE");
    }
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({
        type: "about:blank",
        title: "Model Gateway rejected the request",
        status: response.status,
        detail: "MODEL_GATEWAY_REJECTED",
      }))) as { detail?: unknown };
      throw new HttpException(
        typeof problem.detail === "string"
          ? problem.detail
          : "MODEL_GATEWAY_REJECTED",
        response.status,
      );
    }
    return (await response.json()) as T;
  }
}

export const MODEL_GATEWAY_CREDENTIAL_CLIENT_PROVIDER: Provider = {
  provide: ModelGatewayCredentialClient,
  inject: [ApiConfig],
  useFactory: (config: ApiConfig) => new ModelGatewayCredentialClient(config),
};
