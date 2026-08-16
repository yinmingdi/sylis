import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AgentReleaseCommandKind } from "@sylis/agent-contracts";
import {
  AgentEvaluationKind,
  AgentReleaseEnvironment,
  AgentReleaseKind,
} from "@sylis/database";

import { AdminApiConfig } from "../../config/admin-api.config";
import type { AdminActor } from "../../platform/auth/admin-actor";

@Injectable()
export class AgentApiClient {
  constructor(private readonly config: AdminApiConfig) {}

  overview(actor: AdminActor) {
    return this.post<unknown>("overview/query", { actor: ownerActor(actor) });
  }

  runs(actor: AdminActor) {
    return this.post<unknown>("agent-runs/query", { actor: ownerActor(actor) });
  }

  releases(actor: AdminActor) {
    return this.post<unknown>("agent-releases/query", {
      actor: ownerActor(actor),
    });
  }

  previewRunTermination(actor: AdminActor, runId: string, reason: string) {
    return this.post<unknown>(`agent-runs/${runId}/termination-previews`, {
      actor: ownerActor(actor),
      reason,
    });
  }

  terminateRun(
    actor: AdminActor,
    runId: string,
    input: { reason: string; actionDigest: string },
  ) {
    return this.post<unknown>(`agent-runs/${runId}/terminations`, {
      actor: ownerActor(actor),
      ...input,
    });
  }

  previewReleaseAction(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    input: {
      action: AgentReleaseCommandKind;
      reason: string;
      environment?: AgentReleaseEnvironment;
      targetReleaseId?: string;
      evaluationKind?: AgentEvaluationKind;
      evalReleaseId?: string;
    },
  ) {
    return this.post<unknown>(
      `agent-releases/${releaseKind}/${releaseId}/action-previews`,
      { actor: ownerActor(actor), ...input },
    );
  }

  createReleaseCandidate(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    input: ReleaseAction,
  ) {
    return this.releaseAction(
      actor,
      releaseKind,
      releaseId,
      "candidates",
      input,
    );
  }

  validateRelease(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    input: ReleaseAction,
  ) {
    return this.releaseAction(
      actor,
      releaseKind,
      releaseId,
      "validations",
      input,
    );
  }

  evaluateRelease(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    input: ReleaseAction & {
      evaluationKind: AgentEvaluationKind;
      evalReleaseId: string;
    },
  ) {
    return this.releaseAction(
      actor,
      releaseKind,
      releaseId,
      "evaluations",
      input,
    );
  }

  approveRelease(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    input: ReleaseAction,
  ) {
    return this.releaseAction(
      actor,
      releaseKind,
      releaseId,
      "approvals",
      input,
    );
  }

  promoteRelease(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    input: ReleaseAction & { environment: AgentReleaseEnvironment },
  ) {
    return this.releaseAction(
      actor,
      releaseKind,
      releaseId,
      "promotions",
      input,
    );
  }

  rollbackRelease(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    input: ReleaseAction & {
      environment: AgentReleaseEnvironment;
      targetReleaseId: string;
    },
  ) {
    return this.releaseAction(
      actor,
      releaseKind,
      releaseId,
      "rollbacks",
      input,
    );
  }

  revokeRelease(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    input: ReleaseAction,
  ) {
    return this.releaseAction(
      actor,
      releaseKind,
      releaseId,
      "revocations",
      input,
    );
  }

  private releaseAction(
    actor: AdminActor,
    releaseKind: AgentReleaseKind,
    releaseId: string,
    action: string,
    input: ReleaseAction,
  ) {
    return this.post<unknown>(
      `agent-releases/${releaseKind}/${releaseId}/${action}`,
      { actor: ownerActor(actor), ...input },
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(
        new URL(`/internal/v1/admin/${path}`, this.config.agentApiUrl),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.agentApiServiceToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new ServiceUnavailableException("AGENT_API_UNAVAILABLE");
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `AGENT_API_REJECTED:${response.status}`,
      );
    }
    return (await response.json()) as T;
  }
}

interface ReleaseAction {
  reason: string;
  actionDigest: string;
}

function ownerActor(actor: AdminActor) {
  return {
    userId: actor.userId,
    sessionId: actor.sessionId,
    roles: actor.roles,
  };
}
