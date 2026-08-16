import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { AdminApiConfig } from "../../config/admin-api.config";
import type { AdminActor } from "../../platform/auth/admin-actor";

@Injectable()
export class ModelGatewayClient {
  constructor(private readonly config: AdminApiConfig) {}

  overview(actor: AdminActor) {
    return this.post<unknown>("overview/query", actor);
  }

  routes(actor: AdminActor) {
    return this.post<unknown>("routes/query", actor);
  }

  credentials(actor: AdminActor) {
    return this.post<unknown>("credentials/query", actor);
  }

  usage(actor: AdminActor) {
    return this.post<unknown>("usage/query", actor);
  }

  createCredential(actor: AdminActor, credential: unknown) {
    return this.post<unknown>("credentials", actor, { credential });
  }

  rotateCredential(actor: AdminActor, profileId: string, credential: unknown) {
    return this.post<unknown>(`credentials/${profileId}/rotations`, actor, {
      credential,
    });
  }

  validateCredential(
    actor: AdminActor,
    revisionId: string,
    input: { routeReleaseId: string; reason: string },
  ) {
    return this.post<unknown>(
      `credential-revisions/${revisionId}/validations`,
      actor,
      input,
    );
  }

  credentialAction(
    actor: AdminActor,
    profileId: string,
    action: "revocations" | "quarantines" | "restorations",
    reason: string,
  ) {
    return this.post<unknown>(
      `credential-profiles/${profileId}/${action}`,
      actor,
      { reason },
    );
  }

  routeAction(
    actor: AdminActor,
    routeReleaseId: string,
    action: "security-revocations" | "restorations",
    reason: string,
  ) {
    return this.post<unknown>(
      `provider-routes/${routeReleaseId}/${action}`,
      actor,
      { reason },
    );
  }

  probeRoute(actor: AdminActor, routeReleaseId: string, input: unknown) {
    return this.post<unknown>(
      `provider-routes/${routeReleaseId}/health-probes`,
      actor,
      input,
    );
  }

  createBudget(actor: AdminActor, budget: unknown) {
    return this.post<unknown>("budgets", actor, { budget });
  }

  createQuota(actor: AdminActor, quota: unknown) {
    return this.post<unknown>("quotas", actor, { quota });
  }

  private async post<T>(
    path: string,
    actor: AdminActor,
    input: unknown = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(
        new URL(`/internal/v1/admin/${path}`, this.config.modelGatewayUrl),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.modelGatewayServiceToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ actor: ownerActor(actor), ...record(input) }),
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch {
      throw new ServiceUnavailableException("MODEL_GATEWAY_UNAVAILABLE");
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `MODEL_GATEWAY_REJECTED:${response.status}`,
      );
    }
    return (await response.json()) as T;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("MODEL_GATEWAY_INPUT_INVALID");
  }
  return value as Record<string, unknown>;
}

function ownerActor(actor: AdminActor) {
  return {
    userId: actor.userId,
    sessionId: actor.sessionId,
    roles: actor.roles,
  };
}
