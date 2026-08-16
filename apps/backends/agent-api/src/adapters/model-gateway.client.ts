import { Injectable, type Provider } from "@nestjs/common";
import {
  buildAgentStreamingRequest,
  type AgentArtifactEvidence,
  type AgentContextEvidence,
  type AgentProposalEvidence,
  type AgentSkillDefinition,
  type AgentToolDefinition,
  type AgentToolEvidence,
  type AgentWaitEvidence,
  type CapabilityKey,
  type ModelContentFragmentSnapshot,
} from "@sylis/agent-contracts";
import {
  ModelContentOwnerKind,
  ModelContentRetentionClass,
  ModelContentVisibility,
  ModelExecutionOwnerType,
  ModelOperationKind,
  ModelPurposeKind,
  ModelRetentionMode,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

import { AgentApiConfig } from "../config/agent-api.config";

type AgentOwnedContentKind =
  | (typeof ModelContentOwnerKind)["AGENT_INSTRUCTION"]
  | (typeof ModelContentOwnerKind)["AGENT_MESSAGE"]
  | (typeof ModelContentOwnerKind)["AGENT_PROPOSAL"]
  | (typeof ModelContentOwnerKind)["AGENT_ARTIFACT"]
  | (typeof ModelContentOwnerKind)["AGENT_MEMORY"]
  | (typeof ModelContentOwnerKind)["AGENT_TOOL_INPUT"]
  | (typeof ModelContentOwnerKind)["AGENT_TOOL_RESULT"];

type CreateContentInput = {
  ownerUserId: string;
  plaintext: string;
  idempotencyKey: string;
} & (
  | {
      ownerKind: AgentOwnedContentKind;
      ownerResourceId?: never;
    }
  | {
      ownerKind: (typeof ModelContentOwnerKind)["ASSET_PROCESSING"];
      ownerResourceId: string;
    }
);

@Injectable()
export class ModelGatewayClient {
  constructor(
    private readonly config: AgentApiConfig,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  createContent(
    input: CreateContentInput,
  ): Promise<{ id: string; contentHash: string }> {
    return this.request("model-content-bodies", {
      ownerKind: input.ownerKind,
      ownerUserId: input.ownerUserId,
      ownerResourceId:
        input.ownerKind === ModelContentOwnerKind.ASSET_PROCESSING
          ? input.ownerResourceId
          : undefined,
      purpose:
        input.ownerKind === ModelContentOwnerKind.ASSET_PROCESSING
          ? ModelPurposeKind.ASSET_PROCESSING
          : ModelPurposeKind.AGENT_RUN,
      plaintext: input.plaintext,
      visibility: ModelContentVisibility.USER,
      retentionClass: ModelContentRetentionClass.USER_CONTROLLED,
      idempotencyKey: input.idempotencyKey,
    });
  }

  readContent(
    id: string,
    ownerUserId: string,
  ): Promise<{ plaintext: string; contentHash: string }> {
    return this.request(
      `model-content-bodies/${encodeURIComponent(id)}?ownerUserId=${encodeURIComponent(ownerUserId)}`,
      undefined,
      "GET",
    );
  }

  readFragment(
    id: string,
    ownerUserId: string,
  ): Promise<ModelContentFragmentSnapshot> {
    return this.request(
      `model-content-fragments/${encodeURIComponent(id)}?ownerUserId=${encodeURIComponent(ownerUserId)}`,
      undefined,
      "GET",
    );
  }

  hideContentBodies(input: {
    ownerUserId: string;
    ids: readonly string[];
    purgeAfter: string;
  }): Promise<{ hidden: number }> {
    return this.request("model-content-bodies/hide", input);
  }

  purgeContentBodies(input: {
    ownerUserId: string;
    ids: readonly string[];
  }): Promise<{ purged: number }> {
    return this.request("model-content-bodies/purge", input);
  }

  hideModelExchanges(input: {
    ownerUserId: string;
    ids: readonly string[];
    purgeAfter: string;
  }): Promise<{ hidden: number }> {
    return this.request("model-exchanges/hide", input);
  }

  assertModelExchangeOwnership(input: {
    ownerUserId: string;
    ids: readonly string[];
  }): Promise<{ owned: number }> {
    return this.request("model-exchanges/assert-ownership", input);
  }

  purgeModelExchanges(input: {
    ownerUserId: string;
    ids: readonly string[];
  }): Promise<{
    exchanges: number;
    parts: number;
    purgedBodies: number;
    retainedSharedBodies: number;
  }> {
    return this.request("model-exchanges/purge", input);
  }

  issueAgentPermit(input: {
    runId: string;
    userId: string;
    routeReleaseId: string;
    credentialRevisionId: string;
    capabilityReleaseId: string;
    capability: CapabilityKey;
    systemPrompt: string;
    goal: string;
    tools: readonly AgentToolDefinition[];
    skills: readonly AgentSkillDefinition[];
    toolEvidence: readonly AgentToolEvidence[];
    artifactEvidence: readonly AgentArtifactEvidence[];
    waitEvidence: readonly AgentWaitEvidence[];
    proposalEvidence: readonly AgentProposalEvidence[];
    contextEvidence: readonly AgentContextEvidence[];
    maxChildRuns: number;
    maxOutputTokens: number;
    attemptId: string;
    stepOrdinal: number;
  }): Promise<{ permitId: string }> {
    const request = buildAgentStreamingRequest(input);
    return this.request("model-execution-permits", {
      callerServiceKey: "agent-executor",
      purpose: ModelPurposeKind.AGENT_RUN,
      ownerType: ModelExecutionOwnerType.AGENT_RUN,
      ownerId: input.runId,
      ownerUserId: input.userId,
      routeReleaseId: input.routeReleaseId,
      credentialRevisionId: input.credentialRevisionId,
      capabilityReleaseId: input.capabilityReleaseId,
      operation: ModelOperationKind.STREAMING_GENERATION,
      inputDigest: digest(request),
      maxInputTokens: Buffer.byteLength(canonicalJson(request), "utf8") + 1_024,
      maxOutputTokens: input.maxOutputTokens,
      retentionMode: ModelRetentionMode.ENCRYPTED_EXCHANGE,
      idempotencyKey: `agent-run/${input.runId}/attempt/${input.attemptId}/step/${input.stepOrdinal}`,
    });
  }

  issueEvaluationPermit(input: {
    evaluationRunId: string;
    releaseId: string;
    suiteRef: string;
    judge: boolean;
    routeReleaseId: string;
    credentialRevisionId: string;
    capabilityReleaseId?: string | null;
  }): Promise<{ permitId: string }> {
    return this.request("evaluation-permits", input);
  }

  private async request<T>(
    path: string,
    body: unknown,
    method: "GET" | "POST" = "POST",
  ): Promise<T> {
    const response = await this.fetchImplementation(
      `${this.config.modelGatewayUrl}/internal/v1/${path}`,
      {
        method,
        headers: {
          authorization: `Bearer ${this.config.serviceGrantToken}`,
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        body: method === "POST" ? JSON.stringify(body) : undefined,
      },
    );
    if (!response.ok) throw new Error(`MODEL_GATEWAY_HTTP_${response.status}`);
    return (await response.json()) as T;
  }
}

export const MODEL_GATEWAY_CLIENT_PROVIDER: Provider = {
  provide: ModelGatewayClient,
  inject: [AgentApiConfig],
  useFactory: (config: AgentApiConfig) => new ModelGatewayClient(config),
};

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
