import {
  ModelExecutionOwnerType,
  ModelOperationKind,
  ModelPurposeKind,
  ModelRetentionMode,
  type ModelRetentionMode as ModelRetentionModeValue,
} from "@sylis/database";
import type {
  StructuredGenerationIdentity,
  StructuredGenerationPort,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "@sylis/lexicon-compiler";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

export interface LexiconModelExecutionContext {
  buildRunId: string;
  routeReleaseId: string;
  credentialRevisionId: string;
  retentionMode?: ModelRetentionModeValue;
}

export class ModelGatewayRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ModelGatewayRequestError";
  }
}

export class ModelGatewayStructuredGenerationPort
  implements StructuredGenerationPort
{
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly context: LexiconModelExecutionContext,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async probe(signal?: AbortSignal): Promise<StructuredGenerationIdentity> {
    const result = await this.invokeStructured<{ ok: boolean }>(
      {
        taskType: "CAPABILITY_PROBE",
        schemaName: "sylis_capability_probe",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean", const: true } },
        },
        systemPrompt: "Return the requested capability probe result.",
        input: { ok: true },
        candidateKey: "capability-probe",
        temperature: 0,
        maxTokens: 32,
      },
      signal,
    );
    return { provider: result.provider, model: result.model };
  }

  generate<T>(
    request: StructuredGenerationRequest,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    return this.invokeStructured(request, signal);
  }

  private async invokeStructured<T>(
    request: StructuredGenerationRequest,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    const inputDigest = digest(request);
    const permit = await this.request<{ permitId: string }>(
      "model-execution-permits",
      {
        callerServiceKey: "lexicon-builder",
        purpose: ModelPurposeKind.LEXICON_BUILD,
        ownerType: ModelExecutionOwnerType.BUILD_RUN,
        ownerId: this.context.buildRunId,
        routeReleaseId: this.context.routeReleaseId,
        credentialRevisionId: this.context.credentialRevisionId,
        operation: ModelOperationKind.STRUCTURED_GENERATION,
        inputDigest,
        maxInputTokens:
          Buffer.byteLength(canonicalJson(request), "utf8") + 1_024,
        maxOutputTokens: request.maxTokens ?? 4_096,
        retentionMode:
          this.context.retentionMode ?? ModelRetentionMode.AUDIT_METADATA_ONLY,
        idempotencyKey: `lexicon-build/${this.context.buildRunId}/${request.candidateKey}`,
      },
      signal,
    );
    return this.request(
      "structured-generations",
      { permitId: permit.permitId, request },
      signal,
    );
  }

  private async request<T>(
    operation: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/${operation}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      },
    );
    if (!response.ok) {
      throw new ModelGatewayRequestError(
        response.status,
        await modelGatewayErrorCode(response),
      );
    }
    return (await response.json()) as T;
  }
}

async function modelGatewayErrorCode(response: Response): Promise<string> {
  const fallback = `MODEL_GATEWAY_HTTP_${response.status}`;
  try {
    const problem = (await response.json()) as { detail?: unknown };
    return typeof problem.detail === "string" &&
      /^[A-Z][A-Z0-9_]{2,119}$/.test(problem.detail)
      ? problem.detail
      : fallback;
  } catch {
    return fallback;
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
