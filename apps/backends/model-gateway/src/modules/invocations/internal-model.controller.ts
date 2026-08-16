import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  CapabilityKey,
  ModelContentBlockKind,
  ModelStreamEventType,
  buildAgentStreamingRequest,
  resolveAgentEvaluationSuite,
  type AgentModelRequest,
  type ModelContentFragmentInput,
} from "@sylis/agent-contracts";
import {
  ModelExecutionOwnerType,
  ModelOperationKind,
  ModelPurposeKind,
  ModelRetentionMode,
  type ModelRetentionMode as ModelRetentionModeType,
} from "@sylis/database";
import type { Response } from "express";
import { randomUUID } from "node:crypto";

import { digest, ModelExecutionService } from "./model-execution.service";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";
import {
  ProviderError,
  StreamingGenerationChunkType,
  StructuredTaskType,
  type StreamingGenerationChunk,
  type StreamingGenerationRequest,
  type StructuredGenerationRequest,
} from "../../providers/contracts";
import { AssetContentPurgeService } from "../content-bodies/asset-content-purge.service";
import { ModelContentBodyService } from "../content-bodies/model-content-body.service";
import { ModelExchangeLifecycleService } from "../content-bodies/model-exchange-lifecycle.service";
import { UserContentPurgeService } from "../content-bodies/user-content-purge.service";

interface ServiceRequest {
  serviceKey?: string;
}

type AssetModelOperationKind =
  | typeof ModelOperationKind.OCR
  | typeof ModelOperationKind.EMBEDDING
  | typeof ModelOperationKind.VISION_ANALYSIS;

@Controller("internal/v1")
@UseGuards(ServiceGrantGuard)
export class InternalModelController {
  constructor(
    private readonly executions: ModelExecutionService,
    private readonly contentBodies: ModelContentBodyService,
    private readonly exchanges: ModelExchangeLifecycleService,
    private readonly assetContentPurge: AssetContentPurgeService,
    private readonly userContentPurge: UserContentPurgeService,
  ) {}

  @Post("content-deletion-requests/:requestId/asset-purge")
  purgeAssetContent(
    @Req() request: ServiceRequest,
    @Param("requestId") requestId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
  ) {
    if (!attemptId || !/^[0-9]+$/.test(fencingToken ?? "")) {
      throw new Error("MODEL_JOB_ATTEMPT_HEADERS_INVALID");
    }
    return this.assetContentPurge.purge(serviceKey(request), requestId, {
      attemptId,
      fencingToken: BigInt(fencingToken),
    });
  }

  @Post("content-deletion-requests/:requestId/user-purge")
  purgeUserContent(
    @Req() request: ServiceRequest,
    @Param("requestId") requestId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
  ) {
    if (!attemptId || !/^[0-9]+$/.test(fencingToken ?? "")) {
      throw new Error("MODEL_JOB_ATTEMPT_HEADERS_INVALID");
    }
    return this.userContentPurge.purge(serviceKey(request), requestId, {
      attemptId,
      fencingToken: BigInt(fencingToken),
    });
  }

  @Post("model-execution-permits")
  issuePermit(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      callerServiceKey: string;
      purpose: ModelPurposeKind;
      ownerType: ModelExecutionOwnerType;
      ownerId: string;
      ownerUserId?: string | null;
      routeReleaseId: string;
      credentialRevisionId: string;
      capabilityReleaseId?: string | null;
      operation: ModelOperationKind;
      inputDigest: string;
      maxInputTokens: number;
      maxOutputTokens: number;
      retentionMode: ModelRetentionModeType;
      idempotencyKey: string;
      expiresInSeconds?: number;
    },
  ) {
    return this.executions.issuePermit({
      ...body,
      issuerServiceKey: serviceKey(request),
    });
  }

  @Post("evaluation-permits")
  issueEvaluationPermit(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      evaluationRunId: string;
      releaseId: string;
      suiteRef: string;
      judge: boolean;
      routeReleaseId: string;
      credentialRevisionId: string;
      capabilityReleaseId?: string | null;
    },
  ) {
    const generationRequest = evaluationGenerationRequest(body);
    return this.executions.issuePermit({
      issuerServiceKey: serviceKey(request),
      callerServiceKey: "agent-evaluator",
      purpose: ModelPurposeKind.AGENT_EVALUATION,
      ownerType: ModelExecutionOwnerType.EVALUATION_RUN,
      ownerId: body.evaluationRunId,
      routeReleaseId: body.routeReleaseId,
      credentialRevisionId: body.credentialRevisionId,
      capabilityReleaseId: body.capabilityReleaseId ?? null,
      operation: ModelOperationKind.STRUCTURED_GENERATION,
      inputDigest: digest(generationRequest),
      maxInputTokens:
        Buffer.byteLength(JSON.stringify(generationRequest), "utf8") + 1_024,
      maxOutputTokens: 2_048,
      retentionMode: ModelRetentionMode.AUDIT_METADATA_ONLY,
      idempotencyKey: `agent-evaluation/${body.evaluationRunId}`,
    });
  }

  @Post("model-content-bodies")
  createContentBody(
    @Req() request: ServiceRequest,
    @Body() body: Parameters<ModelContentBodyService["create"]>[1],
  ) {
    return this.contentBodies.create(serviceKey(request), body);
  }

  @Post("agent-content-fragments")
  appendAgentContentFragment(
    @Req() request: ServiceRequest,
    @Body() body: ModelContentFragmentInput,
  ) {
    return this.contentBodies.appendAgentFragment(serviceKey(request), body);
  }

  @Get("model-content-bodies/:id")
  readContentBody(
    @Req() request: ServiceRequest,
    @Param("id") id: string,
    @Query("ownerUserId") ownerUserId: string,
  ) {
    return this.contentBodies.read(serviceKey(request), id, ownerUserId);
  }

  @Get("model-content-fragments/:id")
  readContentFragment(
    @Req() request: ServiceRequest,
    @Param("id") id: string,
    @Query("ownerUserId") ownerUserId: string,
  ) {
    return this.contentBodies.readAgentFragment(
      serviceKey(request),
      id,
      ownerUserId,
    );
  }

  @Post("model-content-bodies/hide")
  hideContentBodies(
    @Req() request: ServiceRequest,
    @Body()
    body: { ownerUserId: string; ids: readonly string[]; purgeAfter: string },
  ) {
    return this.contentBodies.hide(serviceKey(request), body);
  }

  @Post("model-content-bodies/purge")
  purgeContentBodies(
    @Req() request: ServiceRequest,
    @Body() body: { ownerUserId: string; ids: readonly string[] },
  ) {
    return this.contentBodies.purge(serviceKey(request), body);
  }

  @Post("model-exchanges/hide")
  hideModelExchanges(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      ownerUserId: string;
      ids: readonly string[];
      purgeAfter: string;
    },
  ) {
    return this.exchanges.hide(serviceKey(request), body);
  }

  @Post("model-exchanges/assert-ownership")
  assertModelExchangeOwnership(
    @Req() request: ServiceRequest,
    @Body() body: { ownerUserId: string; ids: readonly string[] },
  ) {
    return this.exchanges.assertOwnership(serviceKey(request), body);
  }

  @Post("model-exchanges/purge")
  purgeModelExchanges(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      ownerUserId: string;
      ids: readonly string[];
      purgeAfter?: string;
    },
  ) {
    return this.exchanges.purge(serviceKey(request), body);
  }

  @Post("probe")
  probe(@Req() request: ServiceRequest, @Body() body: { permitId: string }) {
    return this.executions.probe({
      permitId: body.permitId,
      serviceKey: serviceKey(request),
    });
  }

  @Post("structured-generations")
  structured(
    @Req() request: ServiceRequest,
    @Body() body: { permitId: string; request: StructuredGenerationRequest },
  ) {
    return this.executions.structured({
      permitId: body.permitId,
      serviceKey: serviceKey(request),
      request: body.request,
    });
  }

  @Post("agent-streams")
  async agentStream(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      permitId: string;
      request: AgentModelRequest;
    },
    @Res() response: Response,
  ): Promise<void> {
    response.status(200);
    response.setHeader("content-type", "application/x-ndjson");
    response.setHeader("cache-control", "no-store");
    const generationRequest: StreamingGenerationRequest =
      buildAgentStreamingRequest({
        ...body.request.activation,
        capability: capabilityKey(body.request.capability),
      });
    const disconnectController = new AbortController();
    let clientDisconnected = false;
    const abortDisconnectedStream = (): void => {
      if (!response.writableEnded) {
        clientDisconnected = true;
        disconnectController.abort(
          new Error("MODEL_STREAM_CLIENT_DISCONNECTED"),
        );
      }
    };
    response.once("close", abortDisconnectedStream);
    let opened: Awaited<ReturnType<ModelExecutionService["openStream"]>>;
    try {
      opened = await this.executions.openStream({
        permitId: body.permitId,
        serviceKey: serviceKey(request),
        request: generationRequest,
        signal: disconnectController.signal,
      });
    } catch (error) {
      response.off("close", abortDisconnectedStream);
      throw error;
    }
    writeNdjson(response, {
      type: ModelStreamEventType.INVOCATION_STARTED,
      invocationId: opened.invocationId,
      attemptOrdinal: 0,
    });
    let attemptOrdinal = 0;
    let nextModelPosition = 0;
    let providerSequence = 0;
    let nextProviderBlockIndex = 0;
    let blocks = new Map<string, ProjectedProviderBlock>();
    let providerBlockIds = new Map<number, string>();
    let providerResponseId: string | undefined;
    let acceptedOutput = false;
    let responseCompleted: Extract<
      StreamingGenerationChunk,
      { type: StreamingGenerationChunkType.RESPONSE_COMPLETED }
    > | null = null;
    try {
      for await (const chunk of opened.chunks) {
        if (responseCompleted) {
          throw new Error("MODEL_STREAM_EVENT_AFTER_TERMINAL");
        }
        if (chunk.attemptOrdinal !== attemptOrdinal) {
          if (blocks.size > 0 || nextProviderBlockIndex > 0) {
            throw new Error("MODEL_STREAM_RETRY_AFTER_ACCEPTED_BLOCK");
          }
          attemptOrdinal = chunk.attemptOrdinal;
          nextModelPosition = 0;
          providerSequence = 0;
          nextProviderBlockIndex = 0;
          blocks = new Map();
          providerBlockIds = new Map();
          writeNdjson(response, {
            type: ModelStreamEventType.INVOCATION_STARTED,
            invocationId: opened.invocationId,
            attemptOrdinal,
          });
        }
        providerResponseId = chunk.providerRequestId ?? providerResponseId;
        if (chunk.type === StreamingGenerationChunkType.BLOCK_STARTED) {
          if (
            chunk.providerBlockIndex !== nextProviderBlockIndex ||
            blocks.has(chunk.providerBlockId) ||
            providerBlockIds.has(chunk.providerBlockIndex)
          ) {
            throw new Error("MODEL_STREAM_BLOCK_ORDER_INVALID");
          }
          const block: ProjectedProviderBlock = {
            providerBlockId: chunk.providerBlockId,
            providerBlockIndex: chunk.providerBlockIndex,
            modelPosition: nextModelPosition++,
            kind: chunk.blockKind,
            text: "",
            completed: false,
          };
          nextProviderBlockIndex += 1;
          blocks.set(block.providerBlockId, block);
          providerBlockIds.set(block.providerBlockIndex, block.providerBlockId);
          writeNdjson(response, {
            type: ModelStreamEventType.BLOCK_STARTED,
            invocationId: opened.invocationId,
            modelPosition: block.modelPosition,
            blockKind: block.kind,
          });
          acceptedOutput = true;
        } else if (chunk.type === StreamingGenerationChunkType.TEXT_DELTA) {
          const block = requireOpenProviderBlock(
            blocks,
            chunk,
            ModelContentBlockKind.TEXT,
          );
          block.text += chunk.delta;
          writeNdjson(response, {
            type: ModelStreamEventType.TEXT_DELTA,
            invocationId: opened.invocationId,
            modelPosition: block.modelPosition,
            providerSequence: providerSequence++,
            delta: chunk.delta,
          });
          acceptedOutput = true;
        } else if (
          chunk.type === StreamingGenerationChunkType.REASONING_DELTA
        ) {
          const block = requireOpenProviderBlock(
            blocks,
            chunk,
            ModelContentBlockKind.REASONING,
          );
          acceptedOutput = true;
          writeNdjson(response, {
            type: ModelStreamEventType.REASONING_DELTA,
            invocationId: opened.invocationId,
            modelPosition: block.modelPosition,
            providerSequence: providerSequence++,
          });
        } else if (
          chunk.type === StreamingGenerationChunkType.TOOL_CALL_DELTA
        ) {
          const block = requireOpenProviderBlock(
            blocks,
            chunk,
            ModelContentBlockKind.TOOL_CALL,
          );
          acceptedOutput = true;
          writeNdjson(response, {
            type: ModelStreamEventType.TOOL_CALL_DELTA,
            invocationId: opened.invocationId,
            modelPosition: block.modelPosition,
            providerSequence: providerSequence++,
            ...(chunk.providerCallId
              ? { providerCallId: chunk.providerCallId }
              : {}),
            ...(chunk.providerName ? { providerName: chunk.providerName } : {}),
            argumentsDelta: chunk.argumentsDelta,
          });
        } else if (
          chunk.type === StreamingGenerationChunkType.BLOCK_COMPLETED
        ) {
          const block = requireOpenProviderBlock(
            blocks,
            chunk,
            chunk.block.kind,
          );
          block.completed = true;
          if (chunk.block.kind === ModelContentBlockKind.TEXT) {
            writeNdjson(response, {
              type: ModelStreamEventType.BLOCK_COMPLETED,
              invocationId: opened.invocationId,
              block: {
                kind: ModelContentBlockKind.TEXT,
                modelPosition: block.modelPosition,
                text: block.text,
              },
            });
          } else if (chunk.block.kind === ModelContentBlockKind.REASONING) {
            writeNdjson(response, {
              type: ModelStreamEventType.BLOCK_COMPLETED,
              invocationId: opened.invocationId,
              block: {
                kind: ModelContentBlockKind.REASONING,
                modelPosition: block.modelPosition,
              },
            });
          } else {
            writeNdjson(response, {
              type: ModelStreamEventType.BLOCK_COMPLETED,
              invocationId: opened.invocationId,
              block: {
                kind: ModelContentBlockKind.TOOL_CALL,
                modelPosition: block.modelPosition,
                providerCallId: chunk.block.toolCall.providerCallId,
                providerName: chunk.block.toolCall.providerName,
                input: chunk.block.toolCall.input,
              },
            });
          }
        } else if (chunk.type === StreamingGenerationChunkType.USAGE) {
          writeNdjson(response, {
            type: ModelStreamEventType.USAGE,
            invocationId: opened.invocationId,
            inputTokens: chunk.usage.inputTokens,
            outputTokens: chunk.usage.outputTokens,
          });
        } else if (
          chunk.type === StreamingGenerationChunkType.RESPONSE_COMPLETED
        ) {
          if ([...blocks.values()].some((block) => !block.completed)) {
            throw new Error("MODEL_STREAM_OPEN_BLOCK_AT_COMPLETION");
          }
          responseCompleted = chunk;
        }
      }
      if (!responseCompleted) {
        throw new Error("MODEL_STREAM_TERMINAL_EVENT_MISSING");
      }
      writeNdjson(response, {
        type: ModelStreamEventType.RESPONSE_COMPLETED,
        invocationId: opened.invocationId,
        ...(providerResponseId ? { responseId: providerResponseId } : {}),
        finishReason: responseCompleted.finishReason,
      });
      response.end();
    } catch (error) {
      if (
        !clientDisconnected &&
        !response.destroyed &&
        !response.writableEnded
      ) {
        writeNdjson(response, {
          type: ModelStreamEventType.RESPONSE_FAILED,
          invocationId: opened.invocationId,
          errorCode: internalErrorCode(error),
          retryable: error instanceof ProviderError && error.retryable,
          unknownOutcome:
            acceptedOutput ||
            (error instanceof ProviderError &&
              error.observation?.usage !== undefined),
        });
        response.end();
      }
    } finally {
      response.off("close", abortDisconnectedStream);
    }
  }

  @Post("evaluations")
  async evaluate(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      permitId: string;
      evaluationRunId: string;
      releaseId: string;
      suiteRef: string;
      judge: boolean;
    },
  ) {
    const result = await this.executions.structured<{
      score: number;
      passed: boolean;
      metrics: Record<string, number>;
    }>({
      permitId: body.permitId,
      serviceKey: serviceKey(request),
      request: evaluationGenerationRequest(body),
    });
    return { evidenceId: randomUUID(), ...result.value };
  }

  @Post("asset-processing")
  async processAsset(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      permitId: string;
      assetRevisionId: string;
      operation: AssetModelOperationKind;
    },
  ) {
    const result = await this.executions.structured<Record<string, unknown>>({
      permitId: body.permitId,
      serviceKey: serviceKey(request),
      operation: body.operation,
      request: {
        taskType: `ASSET_${body.operation}`,
        schemaName: "sylis_asset_processing",
        schema: { type: "object", additionalProperties: true },
        systemPrompt:
          "Process the pinned clean asset revision for the requested operation.",
        input: body,
        candidateKey: `${body.assetRevisionId}:${body.operation}`,
        maxTokens: 4_096,
      },
    });
    return result.value;
  }
}

interface ProjectedProviderBlock {
  providerBlockId: string;
  providerBlockIndex: number;
  modelPosition: number;
  kind: ModelContentBlockKind;
  text: string;
  completed: boolean;
}

function requireOpenProviderBlock(
  blocks: ReadonlyMap<string, ProjectedProviderBlock>,
  chunk: StreamingGenerationChunk & {
    providerBlockId: string;
    providerBlockIndex: number;
  },
  expectedKind: ModelContentBlockKind,
): ProjectedProviderBlock {
  const block = blocks.get(chunk.providerBlockId);
  if (
    !block ||
    block.providerBlockIndex !== chunk.providerBlockIndex ||
    block.kind !== expectedKind ||
    block.completed
  ) {
    throw new Error("MODEL_STREAM_BLOCK_IDENTITY_INVALID");
  }
  return block;
}

function capabilityKey(value: unknown): CapabilityKey {
  if (Object.values(CapabilityKey).includes(value as CapabilityKey)) {
    return value as CapabilityKey;
  }
  throw new Error("AGENT_CAPABILITY_INVALID");
}

function internalErrorCode(error: unknown): string {
  if (error instanceof ProviderError) return error.code;
  if (
    error instanceof Error &&
    /^[A-Z][A-Z0-9_]*(?::[A-Z0-9_]+)*$/.test(error.message)
  ) {
    return error.message;
  }
  return "AGENT_RESPONSE_PROCESSING_FAILED";
}

function evaluationGenerationRequest(input: {
  evaluationRunId: string;
  releaseId: string;
  suiteRef: string;
  judge: boolean;
}): StructuredGenerationRequest {
  const suite = resolveAgentEvaluationSuite(input.suiteRef);
  const metricProperties = Object.fromEntries(
    suite.cases.map(({ id }) => [
      id,
      { type: "number", minimum: 0, maximum: 1 },
    ]),
  );
  return {
    taskType: input.judge
      ? StructuredTaskType.AGENT_RELEASE_JUDGEMENT
      : StructuredTaskType.AGENT_RELEASE_EVALUATION,
    schemaName: "sylis_agent_evaluation",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["score", "passed", "metrics"],
      properties: {
        score: { type: "number", minimum: 0, maximum: 1 },
        passed: { type: "boolean" },
        metrics: {
          type: "object",
          additionalProperties: false,
          required: suite.cases.map(({ id }) => id),
          properties: metricProperties,
        },
      },
    },
    systemPrompt:
      "Evaluate the pinned release against the immutable suite and return evidence metrics.",
    input: {
      evaluationRunId: input.evaluationRunId,
      releaseId: input.releaseId,
      suiteRef: input.suiteRef,
      suite,
      judge: input.judge,
    },
    candidateKey: input.evaluationRunId,
    maxTokens: 2_048,
  };
}

function serviceKey(request: ServiceRequest): string {
  if (!request.serviceKey) throw new Error("SERVICE_GRANT_CONTEXT_MISSING");
  return request.serviceKey;
}

function writeNdjson(response: Response, value: unknown): void {
  response.write(`${JSON.stringify(value)}\n`);
}
