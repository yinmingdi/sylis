import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { ModelContentBlockKind } from "@sylis/agent-contracts";
import {
  MODEL_EXECUTION_PERMIT_TARGET_INCLUDE,
  CredentialOwnerKind,
  CredentialStatus,
  ImmutableReleaseStatus,
  ModelCapabilityKind,
  ModelExecutionOwnerType,
  ModelInvocationAttemptStatus,
  ModelInvocationStatus,
  ModelOperationKind,
  ModelPermitStatus,
  ModelPolicyScopeKind,
  ModelPurposeKind,
  ModelUsageEntryType,
  Prisma,
  modelExecutionPermitOwner,
  type ModelExecutionPermitWithTarget,
  type ModelRetentionMode,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import Ajv2020 from "ajv/dist/2020";
import { createHash } from "node:crypto";

import {
  PermitReservationSelectorKind,
  terminateIssuedPermitReservations,
} from "./permit-reservation";
import { MODEL_DATABASE } from "../../platform/database/database.module";
import { CredentialCryptoService } from "../../platform/encryption/credential-crypto.service";
import {
  ProviderError,
  ProviderErrorCode,
  StreamingGenerationChunkType,
  type JsonSchema,
  type ProviderRoute,
  type ProviderUsage,
  type StreamingGenerationChunk,
  type StreamingGenerationRequest,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "../../providers/contracts";
import { ProviderRegistry } from "../../providers/provider-registry";

const structuredOutputValidator = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});

const SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS = 3;

@Injectable()
export class ModelExecutionService {
  private readonly logger = new Logger(ModelExecutionService.name);

  constructor(
    @Inject(MODEL_DATABASE) private readonly database: SylisDatabase,
    private readonly credentialCrypto: CredentialCryptoService,
    private readonly providers: ProviderRegistry,
  ) {}

  async issuePermit(input: {
    issuerServiceKey: string;
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
    retentionMode: ModelRetentionMode;
    idempotencyKey: string;
    expiresInSeconds?: number;
  }): Promise<{ permitId: string; inputDigest: string; expiresAt: string }> {
    assertPermitIssuer(input.issuerServiceKey, input.callerServiceKey);
    assertOwnerPurpose(input.purpose, input.ownerType);
    assertDigest(input.inputDigest);
    assertTokenLimit(input.maxInputTokens, "maxInputTokens");
    assertTokenLimit(input.maxOutputTokens, "maxOutputTokens");
    const expiresInSeconds = input.expiresInSeconds ?? 300;
    if (
      !Number.isSafeInteger(expiresInSeconds) ||
      expiresInSeconds < 10 ||
      expiresInSeconds > 300
    ) {
      throw new Error("MODEL_PERMIT_EXPIRY_INVALID");
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,255}$/.test(input.idempotencyKey)) {
      throw new Error("MODEL_PERMIT_IDEMPOTENCY_KEY_INVALID");
    }

    const requestKey = `${input.issuerServiceKey}:${input.idempotencyKey}`;
    const existing = await this.database.modelExecutionPermit.findUnique({
      where: { requestKey },
      include: MODEL_EXECUTION_PERMIT_TARGET_INCLUDE,
    });
    if (existing) {
      assertSamePermit(existing, input);
      return {
        permitId: existing.id,
        inputDigest: existing.inputDigest,
        expiresAt: existing.expiresAt.toISOString(),
      };
    }

    const [route, credential] = await Promise.all([
      this.database.providerRouteRelease.findUnique({
        where: { id: input.routeReleaseId },
      }),
      this.database.credentialRevision.findUnique({
        where: { id: input.credentialRevisionId },
        include: { profile: true },
      }),
    ]);
    if (!route || route.status !== ImmutableReleaseStatus.PUBLISHED) {
      throw new Error("MODEL_ROUTE_NOT_AVAILABLE");
    }
    if (!route.capabilities.includes(operationCapability(input.operation))) {
      throw new Error("MODEL_ROUTE_CAPABILITY_MISMATCH");
    }
    if (
      !credential ||
      credential.status !== CredentialStatus.VERIFIED ||
      credential.profile.status !== CredentialStatus.VERIFIED ||
      credential.profile.currentRevisionId !== credential.id ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt <= new Date()) ||
      credential.profile.providerKey !== route.providerKey ||
      (credential.profile.ownerKind === CredentialOwnerKind.USER &&
        credential.profile.ownerUserId !== input.ownerUserId)
    ) {
      throw new Error("MODEL_CREDENTIAL_NOT_AVAILABLE");
    }

    const maxCostMicros = calculateCost(
      {
        inputTokens: input.maxInputTokens,
        outputTokens: input.maxOutputTokens,
        cacheHitTokens: 0,
      },
      route.pricing,
    );
    const maxUnits = BigInt(input.maxInputTokens + input.maxOutputTokens);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1_000);
    const permit = await this.runSerializableTransaction(
      requestKey,
      async (transaction) => {
        await this.assertOwnerBudget(input, maxCostMicros, transaction);
        await this.assertPublishedPolicies(
          input,
          maxCostMicros,
          maxUnits,
          transaction,
        );
        const created = await transaction.modelExecutionPermit.create({
          data: {
            callerServiceKey: input.callerServiceKey,
            purpose: input.purpose,
            ownerType: input.ownerType,
            ...permitTargetCreate(input.ownerType, input.ownerId),
            ownerUserId: input.ownerUserId ?? null,
            routeReleaseId: input.routeReleaseId,
            credentialRevisionId: input.credentialRevisionId,
            capabilityReleaseId: input.capabilityReleaseId ?? null,
            operation: input.operation,
            inputDigest: input.inputDigest,
            maxInputTokens: input.maxInputTokens,
            maxOutputTokens: input.maxOutputTokens,
            maxCostMicros,
            retentionMode: input.retentionMode,
            requestKey,
            expiresAt,
          },
        });
        await transaction.modelUsageLedger.create({
          data: {
            userId: input.ownerUserId ?? null,
            purpose: input.purpose,
            ownerType: input.ownerType,
            ownerId: input.ownerId,
            routeReleaseId: input.routeReleaseId,
            permitId: created.id,
            credentialOwnerKind: credential.profile.ownerKind,
            entryType: ModelUsageEntryType.RESERVATION,
            units: maxUnits,
            costMicros: maxCostMicros,
            idempotencyKey: created.requestKey,
          },
        });
        return created;
      },
    );
    return {
      permitId: permit.id,
      inputDigest: permit.inputDigest,
      expiresAt: permit.expiresAt.toISOString(),
    };
  }

  private async runSerializableTransaction<T>(
    requestKey: string,
    operation: (transaction: SylisTransaction) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.database.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !isSerializableTransactionConflict(error) ||
          attempt === SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn(
          JSON.stringify({
            event: "model_execution_permit_transaction_retry",
            requestKey,
            attempt,
            errorCode: "P2034",
          }),
        );
      }
    }
    throw new Error("MODEL_PERMIT_TRANSACTION_RETRY_EXHAUSTED");
  }

  async structured<T>(input: {
    permitId: string;
    serviceKey: string;
    operation?: ModelOperationKind;
    request: StructuredGenerationRequest;
    signal?: AbortSignal;
  }): Promise<StructuredGenerationResult<T>> {
    const execution = await this.begin(
      input.permitId,
      input.serviceKey,
      input.request,
      input.operation ?? ModelOperationKind.STRUCTURED_GENERATION,
    );
    const attempt = await this.database.modelInvocationAttempt.create({
      data: { invocationId: execution.invocationId, ordinal: 0 },
    });
    const startedAt = Date.now();
    let observedProviderRequestId: string | null = null;
    let observedUsage: ProviderUsage | undefined;
    let acceptedOutput = false;
    let result: StructuredGenerationResult<T>;
    try {
      result = await this.providers
        .resolve(execution.route.providerKey)
        .structured<T>({
          route: execution.route,
          apiKey: execution.apiKey,
          request: input.request,
          signal: input.signal,
        });
      observedProviderRequestId = result.providerRequestId;
      observedUsage = result.usage;
      assertStructuredOutput(input.request.schema, result.value);
      acceptedOutput = true;
      await this.database.modelInvocationAttempt.update({
        where: { id: attempt.id },
        data: {
          providerRequestId: result.providerRequestId,
          status: ModelInvocationAttemptStatus.SUCCEEDED,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costMicros: calculateCost(result.usage, execution.pricing),
          acceptedBlockCount: 1,
          usageObserved: true,
          latencyMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      const observation = providerObservation(error);
      observedProviderRequestId =
        observation?.providerRequestId ?? observedProviderRequestId;
      observedUsage = observation?.usage ?? observedUsage;
      const cancelled = input.signal?.aborted === true && !observedUsage;
      await this.database.modelInvocationAttempt.update({
        where: { id: attempt.id },
        data: {
          providerRequestId: observedProviderRequestId,
          status: cancelled
            ? ModelInvocationAttemptStatus.CANCELLED
            : ModelInvocationAttemptStatus.FAILED,
          errorClass: stableProviderErrorClass(error),
          inputTokens: observedUsage?.inputTokens ?? 0,
          outputTokens: observedUsage?.outputTokens ?? 0,
          costMicros: observedUsage
            ? calculateCost(observedUsage, execution.pricing)
            : 0n,
          acceptedBlockCount: acceptedOutput ? 1 : 0,
          usageObserved: observedUsage !== undefined,
          latencyMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      });
      await this.fail(execution.invocationId, error, {
        unknownOutcome: false,
        cancelled,
        usage: observedUsage,
      });
      throw error;
    }
    try {
      await this.succeed(
        execution,
        result.providerRequestId,
        result.usage,
        result.value,
        Date.now() - startedAt,
      );
      return result;
    } catch (error) {
      await this.fail(execution.invocationId, error, {
        unknownOutcome: false,
        cancelled: false,
        usage: result.usage,
      });
      throw error;
    }
  }

  async openStream(input: {
    permitId: string;
    serviceKey: string;
    request: StreamingGenerationRequest;
    signal?: AbortSignal;
  }): Promise<{
    invocationId: string;
    chunks: AsyncIterable<
      StreamingGenerationChunk & { attemptOrdinal: number }
    >;
  }> {
    const execution = await this.begin(
      input.permitId,
      input.serviceKey,
      input.request,
      ModelOperationKind.STREAMING_GENERATION,
    );
    return {
      invocationId: execution.invocationId,
      chunks: this.providerStream(execution, input.request, input.signal),
    };
  }

  private async *providerStream(
    execution: Awaited<ReturnType<ModelExecutionService["begin"]>>,
    request: StreamingGenerationRequest,
    signal?: AbortSignal,
  ): AsyncIterable<StreamingGenerationChunk & { attemptOrdinal: number }> {
    for (let attemptOrdinal = 0; attemptOrdinal < 2; attemptOrdinal += 1) {
      const attempt = await this.database.modelInvocationAttempt.create({
        data: { invocationId: execution.invocationId, ordinal: attemptOrdinal },
      });
      const startedAt = Date.now();
      let usage: ProviderUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheHitTokens: 0,
      };
      let responseId: string | null = null;
      const output: string[] = [];
      let acceptedFragmentCount = 0;
      let acceptedToolCallCount = 0;
      let acceptedBlockCount = 0;
      let usageObserved = false;
      let responseCompleted: Extract<
        StreamingGenerationChunk,
        { type: StreamingGenerationChunkType.RESPONSE_COMPLETED }
      > | null = null;
      let attemptFinalized = false;
      const settleFailedAttempt = async (
        error: unknown,
        options: {
          unknownOutcome: boolean;
          cancelled: boolean;
          retry: boolean;
        },
      ): Promise<void> => {
        const failure = providerFailure(error);
        await this.database.modelInvocationAttempt.update({
          where: { id: attempt.id },
          data: {
            providerRequestId: responseId,
            status: options.unknownOutcome
              ? ModelInvocationAttemptStatus.UNKNOWN_OUTCOME
              : options.cancelled
                ? ModelInvocationAttemptStatus.CANCELLED
                : ModelInvocationAttemptStatus.FAILED,
            retryReason: options.retry ? failure.errorCode : null,
            errorClass: failure.errorCode,
            inputTokens: usageObserved ? usage.inputTokens : 0,
            outputTokens: usageObserved ? usage.outputTokens : 0,
            costMicros: usageObserved
              ? calculateCost(usage, execution.pricing)
              : 0n,
            acceptedBlockCount,
            acceptedFragmentCount,
            acceptedToolCallCount,
            usageObserved,
            latencyMs: Date.now() - startedAt,
            completedAt: new Date(),
          },
        });
        attemptFinalized = true;
        this.logger.error(
          JSON.stringify({
            event: "model_execution_failed",
            phase: "provider_stream",
            invocationId: execution.invocationId,
            permitId: execution.permitId,
            attemptOrdinal,
            routeReleaseId: execution.routeReleaseId,
            provider: execution.route.providerKey,
            model: execution.route.modelId,
            operation: ModelOperationKind.STREAMING_GENERATION,
            unknownOutcome: options.unknownOutcome,
            retrying: options.retry,
            ...failure,
          }),
        );
        if (!options.retry) {
          await this.fail(execution.invocationId, error, {
            unknownOutcome: options.unknownOutcome,
            cancelled: options.cancelled,
            usage: usageObserved ? usage : undefined,
          });
        }
      };
      try {
        for await (const chunk of this.providers
          .resolve(execution.route.providerKey)
          .stream({
            route: execution.route,
            apiKey: execution.apiKey,
            request,
            signal,
          })) {
          if (responseCompleted) {
            throw new ProviderError(
              ProviderErrorCode.INVALID_RESPONSE,
              "Provider emitted a stream event after response completion.",
              false,
            );
          }
          if (chunk.type === StreamingGenerationChunkType.BLOCK_STARTED) {
            acceptedBlockCount += 1;
          } else if (chunk.type === StreamingGenerationChunkType.TEXT_DELTA) {
            output.push(chunk.delta);
            if (chunk.delta.length > 0) acceptedFragmentCount += 1;
          } else if (
            chunk.type === StreamingGenerationChunkType.REASONING_DELTA
          ) {
            if (chunk.delta.length > 0) acceptedFragmentCount += 1;
          } else if (
            chunk.type === StreamingGenerationChunkType.TOOL_CALL_DELTA
          ) {
            if (
              chunk.argumentsDelta.length > 0 ||
              chunk.providerCallId !== undefined ||
              chunk.providerName !== undefined
            ) {
              acceptedFragmentCount += 1;
            }
          } else if (
            chunk.type === StreamingGenerationChunkType.BLOCK_COMPLETED &&
            chunk.block.kind === ModelContentBlockKind.TOOL_CALL
          ) {
            output.push(canonicalJson(chunk.block.toolCall));
            acceptedToolCallCount += 1;
          } else if (chunk.type === StreamingGenerationChunkType.USAGE) {
            usage = chunk.usage;
            usageObserved = true;
          } else if (
            chunk.type === StreamingGenerationChunkType.RESPONSE_COMPLETED
          ) {
            responseCompleted = chunk;
          }
          responseId = chunk.providerRequestId ?? responseId;
          if (chunk.type !== StreamingGenerationChunkType.RESPONSE_COMPLETED) {
            yield { ...chunk, attemptOrdinal };
          }
        }
        if (!responseCompleted) {
          throw new ProviderError(
            ProviderErrorCode.INVALID_RESPONSE,
            "Provider stream ended without a response completion event.",
            false,
          );
        }
        const costMicros = calculateCost(usage, execution.pricing);
        await this.database.modelInvocationAttempt.update({
          where: { id: attempt.id },
          data: {
            providerRequestId: responseId,
            status: ModelInvocationAttemptStatus.SUCCEEDED,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costMicros,
            acceptedBlockCount,
            acceptedFragmentCount,
            acceptedToolCallCount,
            usageObserved,
            latencyMs: Date.now() - startedAt,
            completedAt: new Date(),
          },
        });
        attemptFinalized = true;
        await this.succeed(
          execution,
          responseId,
          usage,
          output.join(""),
          Date.now() - startedAt,
        );
        yield { ...responseCompleted, attemptOrdinal };
        return;
      } catch (error) {
        if (attemptFinalized) {
          await this.fail(execution.invocationId, error, {
            unknownOutcome: false,
            cancelled: false,
            usage,
          });
          throw error;
        }
        const failure = providerFailure(error);
        const observation = providerObservation(error);
        responseId = observation?.providerRequestId ?? responseId;
        if (observation?.usage) {
          usage = observation.usage;
          usageObserved = true;
        }
        const unknownOutcome = acceptedBlockCount > 0 || usageObserved;
        const cancelled = signal?.aborted === true && !unknownOutcome;
        const retry =
          failure.retryable === true && !unknownOutcome && attemptOrdinal === 0;
        await settleFailedAttempt(error, { unknownOutcome, cancelled, retry });
        if (retry) continue;
        throw error;
      } finally {
        if (!attemptFinalized) {
          const error = new ProviderError(
            ProviderErrorCode.REQUEST_ABORTED,
            "The model stream consumer closed before settlement.",
            false,
          );
          const unknownOutcome = acceptedBlockCount > 0 || usageObserved;
          await settleFailedAttempt(error, {
            unknownOutcome,
            cancelled: !unknownOutcome,
            retry: false,
          });
        }
      }
    }
    throw new Error("MODEL_PROVIDER_ATTEMPTS_EXHAUSTED");
  }

  async probe(input: {
    permitId: string;
    serviceKey: string;
  }): Promise<{ provider: string; model: string }> {
    const result = await this.structured<{ ok: boolean }>({
      ...input,
      request: {
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
        maxTokens: 32,
      },
    });
    return { provider: result.provider, model: result.model };
  }

  private async begin(
    permitId: string,
    serviceKey: string,
    input: unknown,
    operation: ModelOperationKind,
  ) {
    const inputDigest = digest(input);
    const claimedAt = new Date();
    const permit = await this.database.$transaction(async (transaction) => {
      const found = await transaction.modelExecutionPermit.findUnique({
        where: { id: permitId },
        include: {
          ...MODEL_EXECUTION_PERMIT_TARGET_INCLUDE,
          route: true,
          credentialRevision: { include: { profile: true } },
        },
      });
      if (!found || found.callerServiceKey !== serviceKey) {
        throw new Error("MODEL_PERMIT_NOT_FOUND");
      }
      if (
        found.status === ModelPermitStatus.ISSUED &&
        found.expiresAt <= claimedAt
      ) {
        await terminateIssuedPermitReservations(
          transaction,
          {
            kind: PermitReservationSelectorKind.PERMIT,
            permitId: found.id,
          },
          ModelPermitStatus.EXPIRED,
        );
        return null;
      }
      if (
        found.status !== ModelPermitStatus.ISSUED ||
        found.inputDigest !== inputDigest ||
        found.operation !== operation ||
        estimatedInputTokens(input) > found.maxInputTokens ||
        requestedOutputTokens(input) > found.maxOutputTokens
      ) {
        throw new Error("MODEL_PERMIT_NOT_CLAIMABLE");
      }
      if (
        found.route.status !== ImmutableReleaseStatus.PUBLISHED ||
        !found.route.capabilities.includes(
          operationCapability(found.operation),
        ) ||
        found.credentialRevision.status !== CredentialStatus.VERIFIED ||
        found.credentialRevision.profile.status !== CredentialStatus.VERIFIED ||
        found.credentialRevision.profile.currentRevisionId !==
          found.credentialRevision.id ||
        found.credentialRevision.profile.providerKey !==
          found.route.providerKey ||
        found.credentialRevision.revokedAt ||
        (found.credentialRevision.expiresAt &&
          found.credentialRevision.expiresAt <= claimedAt)
      ) {
        throw new Error("MODEL_EXECUTION_SECURITY_STATE_CHANGED");
      }
      const claimed = await transaction.modelExecutionPermit.updateMany({
        where: { id: found.id, status: ModelPermitStatus.ISSUED },
        data: { status: ModelPermitStatus.CLAIMED, claimedAt },
      });
      if (claimed.count !== 1) throw new Error("MODEL_PERMIT_ALREADY_CLAIMED");
      const owner = modelExecutionPermitOwner(found);
      const invocation = await transaction.modelInvocation.create({
        data: {
          permitId: found.id,
          purpose: found.purpose,
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          routeReleaseId: found.routeReleaseId,
          credentialRevisionId: found.credentialRevisionId,
          status: ModelInvocationStatus.RUNNING,
          idempotencyKey: `permit:${found.id}`,
          inputDigest,
        },
      });
      return { ...found, owner, invocationId: invocation.id };
    });
    if (!permit) throw new Error("MODEL_PERMIT_NOT_CLAIMABLE");
    const apiKey = await this.credentialCrypto.decrypt(
      permit.credentialRevision,
      permit.route.providerKey,
    );
    return {
      invocationId: permit.invocationId,
      permitId: permit.id,
      maxCostMicros: permit.maxCostMicros,
      maxUnits: BigInt(permit.maxInputTokens + permit.maxOutputTokens),
      route: {
        providerKey: permit.route.providerKey,
        modelId: permit.route.modelId,
        endpointClass: permit.route.endpointClass,
      } satisfies ProviderRoute,
      pricing: permit.route.pricing,
      credentialOwnerKind: permit.credentialRevision.profile.ownerKind,
      ownerUserId: permit.ownerUserId,
      usageIdempotencyKey: permit.requestKey,
      purpose: permit.purpose,
      ownerType: permit.owner.ownerType,
      ownerId: permit.owner.ownerId,
      routeReleaseId: permit.routeReleaseId,
      apiKey,
    };
  }

  private async assertOwnerBudget(
    input: {
      purpose: ModelPurposeKind;
      ownerType: ModelExecutionOwnerType;
      ownerId: string;
      routeReleaseId: string;
      credentialRevisionId: string;
    },
    requestedMicros: bigint,
    database: SylisDatabase | SylisTransaction = this.database,
  ): Promise<void> {
    if (input.ownerType !== ModelExecutionOwnerType.BUILD_RUN) return;
    const run = await database.buildRun.findUnique({
      where: { id: input.ownerId },
      select: {
        budgetMicros: true,
        providerRouteReleaseId: true,
        credentialRevisionId: true,
      },
    });
    if (
      !run ||
      run.providerRouteReleaseId !== input.routeReleaseId ||
      run.credentialRevisionId !== input.credentialRevisionId
    ) {
      throw new Error("MODEL_PERMIT_OWNER_POLICY_MISMATCH");
    }
    const now = new Date();
    const [settled, reserved] = await Promise.all([
      database.modelInvocation.aggregate({
        where: {
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          purpose: input.purpose,
          status: {
            in: [
              ModelInvocationStatus.SUCCEEDED,
              ModelInvocationStatus.UNKNOWN_OUTCOME,
            ],
          },
        },
        _sum: { costMicros: true },
      }),
      database.modelExecutionPermit.aggregate({
        where: {
          ownerType: input.ownerType,
          buildRunTarget: { is: { buildRunId: input.ownerId } },
          purpose: input.purpose,
          status: { in: [ModelPermitStatus.ISSUED, ModelPermitStatus.CLAIMED] },
          expiresAt: { gt: now },
        },
        _sum: { maxCostMicros: true },
      }),
    ]);
    const committed =
      (settled._sum.costMicros ?? 0n) + (reserved._sum.maxCostMicros ?? 0n);
    if (committed + requestedMicros > run.budgetMicros) {
      throw new ConflictException("MODEL_PERMIT_BUDGET_EXCEEDED");
    }
  }

  private async assertPublishedPolicies(
    input: {
      purpose: ModelPurposeKind;
      ownerType: ModelExecutionOwnerType;
      ownerId: string;
      ownerUserId?: string | null;
      routeReleaseId: string;
      capabilityReleaseId?: string | null;
    },
    requestedMicros: bigint,
    requestedUnits: bigint,
    database: SylisDatabase | SylisTransaction = this.database,
  ): Promise<void> {
    const now = new Date();
    const [budgets, quotas] = await Promise.all([
      database.budgetPolicy.findMany({
        where: { purpose: input.purpose, effectiveAt: { lte: now } },
        orderBy: { effectiveAt: "desc" },
      }),
      database.quotaPolicy.findMany({
        where: {
          purpose: input.purpose,
          effectiveAt: { lte: now },
          OR: [
            { routeReleaseId: null },
            { routeReleaseId: input.routeReleaseId },
          ],
        },
        orderBy: { effectiveAt: "desc" },
      }),
    ]);
    const latestBudgets = latestApplicablePolicies(budgets, input);
    const latestQuotas = latestApplicablePolicies(quotas, input);

    for (const policy of latestBudgets) {
      const scope = executionScopeFilter(
        policy.scopeKind,
        policy.scopeId,
        input,
      );
      const windowStart = new Date(
        now.getTime() - policy.windowSeconds * 1_000,
      );
      const [settled, reserved] = await Promise.all([
        database.modelInvocation.aggregate({
          where: {
            purpose: input.purpose,
            status: {
              in: [
                ModelInvocationStatus.SUCCEEDED,
                ModelInvocationStatus.UNKNOWN_OUTCOME,
              ],
            },
            completedAt: { gte: windowStart },
            permit: scope,
          },
          _sum: { costMicros: true, inputTokens: true, outputTokens: true },
        }),
        database.modelExecutionPermit.aggregate({
          where: {
            purpose: input.purpose,
            ...scope,
            status: {
              in: [ModelPermitStatus.ISSUED, ModelPermitStatus.CLAIMED],
            },
            expiresAt: { gt: now },
          },
          _sum: {
            maxCostMicros: true,
            maxInputTokens: true,
            maxOutputTokens: true,
          },
        }),
      ]);
      const committedCost =
        (settled._sum.costMicros ?? 0n) + (reserved._sum.maxCostMicros ?? 0n);
      const committedUnits =
        BigInt(
          (settled._sum.inputTokens ?? 0) + (settled._sum.outputTokens ?? 0),
        ) +
        BigInt(
          (reserved._sum.maxInputTokens ?? 0) +
            (reserved._sum.maxOutputTokens ?? 0),
        );
      if (committedCost + requestedMicros > policy.maxCostMicros) {
        throw new Error("MODEL_BUDGET_COST_EXCEEDED");
      }
      if (committedUnits + requestedUnits > policy.maxUnits) {
        throw new Error("MODEL_BUDGET_UNITS_EXCEEDED");
      }
    }

    for (const policy of latestQuotas) {
      const scope = executionScopeFilter(
        policy.scopeKind,
        policy.scopeId,
        input,
      );
      const windowStart = new Date(
        now.getTime() - policy.windowSeconds * 1_000,
      );
      const route = policy.routeReleaseId
        ? { routeReleaseId: policy.routeReleaseId }
        : {};
      const [requestCount, settled, reserved] = await Promise.all([
        database.modelExecutionPermit.count({
          where: {
            purpose: input.purpose,
            ...scope,
            ...route,
            createdAt: { gte: windowStart },
          },
        }),
        database.modelInvocation.aggregate({
          where: {
            purpose: input.purpose,
            status: {
              in: [
                ModelInvocationStatus.SUCCEEDED,
                ModelInvocationStatus.UNKNOWN_OUTCOME,
              ],
            },
            completedAt: { gte: windowStart },
            permit: { ...scope, ...route },
          },
          _sum: { inputTokens: true, outputTokens: true },
        }),
        database.modelExecutionPermit.aggregate({
          where: {
            purpose: input.purpose,
            ...scope,
            ...route,
            status: {
              in: [ModelPermitStatus.ISSUED, ModelPermitStatus.CLAIMED],
            },
            expiresAt: { gt: now },
          },
          _sum: { maxInputTokens: true, maxOutputTokens: true },
        }),
      ]);
      const committedUnits =
        BigInt(
          (settled._sum.inputTokens ?? 0) + (settled._sum.outputTokens ?? 0),
        ) +
        BigInt(
          (reserved._sum.maxInputTokens ?? 0) +
            (reserved._sum.maxOutputTokens ?? 0),
        );
      if (BigInt(requestCount + 1) > policy.maxRequests) {
        throw new Error("MODEL_QUOTA_REQUESTS_EXCEEDED");
      }
      if (committedUnits + requestedUnits > policy.maxUnits) {
        throw new Error("MODEL_QUOTA_UNITS_EXCEEDED");
      }
    }
  }

  private async succeed(
    execution: Awaited<ReturnType<ModelExecutionService["begin"]>>,
    responseId: string | null,
    usage: ProviderUsage,
    output: unknown,
    latencyMs: number,
  ): Promise<void> {
    const costMicros = calculateCost(usage, execution.pricing);
    if (costMicros > execution.maxCostMicros)
      throw new Error("MODEL_PERMIT_COST_EXCEEDED");
    await this.database.$transaction([
      this.database.modelInvocation.update({
        where: { id: execution.invocationId },
        data: {
          responseId,
          status: ModelInvocationStatus.SUCCEEDED,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheHitTokens: usage.cacheHitTokens,
          costMicros,
          latencyMs,
          outputDigest: digest(output),
          completedAt: new Date(),
        },
      }),
      this.database.modelExecutionPermit.update({
        where: { id: execution.permitId },
        data: { status: ModelPermitStatus.CONSUMED, consumedAt: new Date() },
      }),
      this.database.modelUsageLedger.create({
        data: {
          userId: execution.ownerUserId,
          purpose: execution.purpose,
          ownerType: execution.ownerType,
          ownerId: execution.ownerId,
          routeReleaseId: execution.routeReleaseId,
          permitId: execution.permitId,
          credentialOwnerKind: execution.credentialOwnerKind,
          entryType: ModelUsageEntryType.SETTLEMENT,
          units: BigInt(usage.inputTokens + usage.outputTokens),
          costMicros,
          idempotencyKey: execution.usageIdempotencyKey,
        },
      }),
      this.database.modelUsageLedger.create({
        data: {
          userId: execution.ownerUserId,
          purpose: execution.purpose,
          ownerType: execution.ownerType,
          ownerId: execution.ownerId,
          routeReleaseId: execution.routeReleaseId,
          permitId: execution.permitId,
          credentialOwnerKind: execution.credentialOwnerKind,
          entryType: ModelUsageEntryType.RELEASE,
          units: -execution.maxUnits,
          costMicros: -execution.maxCostMicros,
          idempotencyKey: execution.usageIdempotencyKey,
        },
      }),
    ]);
  }

  private async fail(
    invocationId: string,
    error: unknown,
    settlement: {
      unknownOutcome: boolean;
      cancelled: boolean;
      usage?: ProviderUsage;
    },
  ): Promise<void> {
    const invocation = await this.database.modelInvocation.findUnique({
      where: { id: invocationId },
      include: {
        permit: {
          include: {
            ...MODEL_EXECUTION_PERMIT_TARGET_INCLUDE,
            credentialRevision: { include: { profile: true } },
          },
        },
        route: true,
      },
    });
    if (!invocation) return;
    const owner = modelExecutionPermitOwner(invocation.permit);
    const inputTokens =
      settlement.usage?.inputTokens ??
      (settlement.unknownOutcome ? invocation.permit.maxInputTokens : 0);
    const outputTokens =
      settlement.usage?.outputTokens ??
      (settlement.unknownOutcome ? invocation.permit.maxOutputTokens : 0);
    const costMicros = settlement.usage
      ? calculateCost(settlement.usage, invocation.route.pricing)
      : settlement.unknownOutcome
        ? invocation.permit.maxCostMicros
        : 0n;
    await this.database.$transaction([
      this.database.modelInvocation.update({
        where: { id: invocationId },
        data: {
          status: settlement.unknownOutcome
            ? ModelInvocationStatus.UNKNOWN_OUTCOME
            : settlement.cancelled
              ? ModelInvocationStatus.CANCELLED
              : ModelInvocationStatus.FAILED,
          errorClass: stableProviderErrorClass(error),
          inputTokens,
          outputTokens,
          costMicros,
          completedAt: new Date(),
        },
      }),
      this.database.modelExecutionPermit.update({
        where: { id: invocation.permitId },
        data: { status: ModelPermitStatus.CONSUMED, consumedAt: new Date() },
      }),
      this.database.modelUsageLedger.create({
        data: {
          userId: invocation.permit.ownerUserId,
          purpose: invocation.permit.purpose,
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          routeReleaseId: invocation.permit.routeReleaseId,
          permitId: invocation.permit.id,
          credentialOwnerKind:
            invocation.permit.credentialRevision.profile.ownerKind,
          entryType: ModelUsageEntryType.SETTLEMENT,
          units: BigInt(inputTokens + outputTokens),
          costMicros,
          idempotencyKey: invocation.permit.requestKey,
        },
      }),
      this.database.modelUsageLedger.create({
        data: {
          userId: invocation.permit.ownerUserId,
          purpose: invocation.permit.purpose,
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          routeReleaseId: invocation.permit.routeReleaseId,
          permitId: invocation.permit.id,
          credentialOwnerKind:
            invocation.permit.credentialRevision.profile.ownerKind,
          entryType: ModelUsageEntryType.RELEASE,
          units: -BigInt(
            invocation.permit.maxInputTokens +
              invocation.permit.maxOutputTokens,
          ),
          costMicros: -invocation.permit.maxCostMicros,
          idempotencyKey: invocation.permit.requestKey,
        },
      }),
    ]);
  }
}

function isSerializableTransactionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

function providerFailure(error: unknown): {
  errorCode: string;
  errorMessage?: string;
  retryable?: boolean;
  statusCode?: number;
} {
  if (error instanceof ProviderError) {
    return {
      errorCode: error.code,
      errorMessage: error.message,
      retryable: error.retryable,
      ...(error.statusCode === undefined
        ? {}
        : { statusCode: error.statusCode }),
    };
  }
  return { errorCode: "UNEXPECTED_PROVIDER_ERROR" };
}

function providerObservation(error: unknown) {
  return error instanceof ProviderError ? error.observation : undefined;
}

export function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function assertPermitIssuer(issuer: string, caller: string): void {
  const allowed: Readonly<Record<string, readonly string[]>> = {
    "agent-api": ["agent-executor", "agent-evaluator", "asset-processor"],
    "admin-api": ["agent-evaluator"],
    "lexicon-builder": ["lexicon-builder"],
  };
  if (!allowed[issuer]?.includes(caller))
    throw new Error("MODEL_PERMIT_CALLER_FORBIDDEN");
}

function assertDigest(value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value))
    throw new Error("MODEL_PERMIT_DIGEST_INVALID");
}

function assertTokenLimit(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    throw new Error(`MODEL_PERMIT_TOKEN_LIMIT_INVALID:${field}`);
  }
}

function assertSamePermit(
  existing: ModelExecutionPermitWithTarget,
  requested: {
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
  },
): void {
  const existingOwner = modelExecutionPermitOwner(existing);
  for (const key of [
    "callerServiceKey",
    "purpose",
    "ownerType",
    "ownerUserId",
    "routeReleaseId",
    "credentialRevisionId",
    "capabilityReleaseId",
    "operation",
    "inputDigest",
  ] as const) {
    if (existing[key] !== requested[key])
      throw new Error("MODEL_PERMIT_IDEMPOTENCY_CONFLICT");
  }
  if (existingOwner.ownerId !== requested.ownerId) {
    throw new Error("MODEL_PERMIT_IDEMPOTENCY_CONFLICT");
  }
}

function permitTargetCreate(
  ownerType: ModelExecutionOwnerType,
  ownerId: string,
) {
  switch (ownerType) {
    case ModelExecutionOwnerType.AGENT_RUN:
      return { agentRunTarget: { create: { agentRunId: ownerId } } } as const;
    case ModelExecutionOwnerType.BUILD_RUN:
      return { buildRunTarget: { create: { buildRunId: ownerId } } } as const;
    case ModelExecutionOwnerType.EVALUATION_RUN:
      return {
        evaluationRunTarget: { create: { evaluationRunId: ownerId } },
      } as const;
    case ModelExecutionOwnerType.ASSET_REVISION:
      return {
        assetRevisionTarget: { create: { assetRevisionId: ownerId } },
      } as const;
  }
}

function assertOwnerPurpose(
  purpose: ModelPurposeKind,
  ownerType: ModelExecutionOwnerType,
): void {
  const expected: Readonly<Record<ModelPurposeKind, ModelExecutionOwnerType>> =
    {
      [ModelPurposeKind.AGENT_RUN]: ModelExecutionOwnerType.AGENT_RUN,
      [ModelPurposeKind.LEXICON_BUILD]: ModelExecutionOwnerType.BUILD_RUN,
      [ModelPurposeKind.AGENT_EVALUATION]:
        ModelExecutionOwnerType.EVALUATION_RUN,
      [ModelPurposeKind.ASSET_PROCESSING]:
        ModelExecutionOwnerType.ASSET_REVISION,
    };
  if (expected[purpose] !== ownerType) {
    throw new Error("MODEL_PERMIT_OWNER_PURPOSE_MISMATCH");
  }
}

function operationCapability(
  operation: ModelOperationKind,
): ModelCapabilityKind {
  const capabilities: Readonly<
    Record<ModelOperationKind, ModelCapabilityKind>
  > = {
    [ModelOperationKind.STRUCTURED_GENERATION]:
      ModelCapabilityKind.STRUCTURED_GENERATION,
    [ModelOperationKind.STREAMING_GENERATION]:
      ModelCapabilityKind.TEXT_GENERATION,
    [ModelOperationKind.EMBEDDING]: ModelCapabilityKind.EMBEDDING,
    [ModelOperationKind.VISION_ANALYSIS]: ModelCapabilityKind.VISION,
    [ModelOperationKind.OCR]: ModelCapabilityKind.OCR,
  };
  return capabilities[operation];
}

interface ExecutionScopeInput {
  ownerType: ModelExecutionOwnerType;
  ownerId: string;
  ownerUserId?: string | null;
  capabilityReleaseId?: string | null;
}

interface PublishedPolicy {
  scopeKind: ModelPolicyScopeKind;
  scopeId: string | null;
  policyVersion: string;
  routeReleaseId?: string | null;
}

function latestApplicablePolicies<T extends PublishedPolicy>(
  policies: readonly T[],
  input: ExecutionScopeInput,
): T[] {
  const latest = new Map<string, T>();
  for (const policy of policies) {
    if (!policyApplies(policy.scopeKind, policy.scopeId, input)) continue;
    const key = `${policy.scopeKind}:${policy.scopeId ?? "platform"}:${
      policy.routeReleaseId ?? "all-routes"
    }`;
    if (!latest.has(key)) latest.set(key, policy);
  }
  return [...latest.values()];
}

function policyApplies(
  scopeKind: ModelPolicyScopeKind,
  scopeId: string | null,
  input: ExecutionScopeInput,
): boolean {
  switch (scopeKind) {
    case ModelPolicyScopeKind.PLATFORM:
      return scopeId === null;
    case ModelPolicyScopeKind.USER:
      return scopeId === input.ownerUserId;
    case ModelPolicyScopeKind.CAPABILITY_RELEASE:
      return scopeId === input.capabilityReleaseId;
    case ModelPolicyScopeKind.AGENT_RUN:
      return (
        input.ownerType === ModelExecutionOwnerType.AGENT_RUN &&
        scopeId === input.ownerId
      );
    case ModelPolicyScopeKind.BUILD_RUN:
      return (
        input.ownerType === ModelExecutionOwnerType.BUILD_RUN &&
        scopeId === input.ownerId
      );
    case ModelPolicyScopeKind.EVALUATION_RUN:
      return (
        input.ownerType === ModelExecutionOwnerType.EVALUATION_RUN &&
        scopeId === input.ownerId
      );
    case ModelPolicyScopeKind.ASSET_REVISION:
      return (
        input.ownerType === ModelExecutionOwnerType.ASSET_REVISION &&
        scopeId === input.ownerId
      );
  }
  return false;
}

function executionScopeFilter(
  scopeKind: ModelPolicyScopeKind,
  scopeId: string | null,
  input: ExecutionScopeInput,
): {
  ownerUserId?: string;
  ownerType?: ModelExecutionOwnerType;
  ownerId?: string;
  capabilityReleaseId?: string;
} {
  switch (scopeKind) {
    case ModelPolicyScopeKind.PLATFORM:
      return {};
    case ModelPolicyScopeKind.USER:
      return { ownerUserId: scopeId ?? input.ownerUserId ?? undefined };
    case ModelPolicyScopeKind.CAPABILITY_RELEASE:
      return {
        capabilityReleaseId: scopeId ?? input.capabilityReleaseId ?? undefined,
      };
    case ModelPolicyScopeKind.AGENT_RUN:
      return {
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerId: scopeId ?? input.ownerId,
      };
    case ModelPolicyScopeKind.BUILD_RUN:
      return {
        ownerType: ModelExecutionOwnerType.BUILD_RUN,
        ownerId: scopeId ?? input.ownerId,
      };
    case ModelPolicyScopeKind.EVALUATION_RUN:
      return {
        ownerType: ModelExecutionOwnerType.EVALUATION_RUN,
        ownerId: scopeId ?? input.ownerId,
      };
    case ModelPolicyScopeKind.ASSET_REVISION:
      return {
        ownerType: ModelExecutionOwnerType.ASSET_REVISION,
        ownerId: scopeId ?? input.ownerId,
      };
  }
  throw new Error("MODEL_POLICY_SCOPE_UNSUPPORTED");
}

function assertStructuredOutput(schema: JsonSchema, value: unknown): void {
  let validate;
  try {
    validate = structuredOutputValidator.compile(schema);
  } catch {
    throw new Error("MODEL_REQUEST_SCHEMA_INVALID");
  }
  if (!validate(value)) {
    throw new ProviderError(
      "INVALID_RESPONSE",
      "Provider output failed local JSON Schema validation.",
      false,
    );
  }
}

function stableProviderErrorClass(error: unknown): string {
  if (error instanceof ProviderError) return error.code;
  if (
    error instanceof Error &&
    /^[A-Z][A-Z0-9_]*(?::[A-Z0-9_]+)*$/.test(error.message)
  ) {
    return error.message;
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}

function estimatedInputTokens(input: unknown): number {
  return Buffer.byteLength(canonicalJson(input), "utf8") + 1_024;
}

function requestedOutputTokens(input: unknown): number {
  if (!input || typeof input !== "object") return 1;
  const value = (input as { maxTokens?: unknown }).maxTokens;
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : 4_096;
}

function calculateCost(usage: ProviderUsage, pricingValue: unknown): bigint {
  const pricing = pricingValue as Record<string, unknown>;
  const input = decimalMicros(pricing.inputUsdPerMillion);
  const output = decimalMicros(pricing.outputUsdPerMillion);
  const cache = decimalMicros(
    pricing.cacheHitUsdPerMillion ?? pricing.inputUsdPerMillion,
  );
  const billableInput = Math.max(0, usage.inputTokens - usage.cacheHitTokens);
  return (
    tokenCost(billableInput, input) +
    tokenCost(usage.outputTokens, output) +
    tokenCost(usage.cacheHitTokens, cache)
  );
}

function decimalMicros(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error("PROVIDER_PRICING_INVALID");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

function tokenCost(tokens: number, microsPerMillion: bigint): bigint {
  return (BigInt(tokens) * microsPerMillion + 999_999n) / 1_000_000n;
}
