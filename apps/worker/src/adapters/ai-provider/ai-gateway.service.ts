import { Inject, Injectable } from "@nestjs/common";
import type {
  StreamingGenerationRequest,
  StructuredGenerationRequest,
} from "@sylis/ai-provider";
import { createRuntimeDeepSeekAdaptersFromEnv } from "@sylis/ai-provider/deepseek";
import { Prisma, type SylisDatabase } from "@sylis/database";
import { createHash } from "node:crypto";

import { WorkerConfig } from "../../config/worker-config";
import type { ClaimedWorkerJob } from "../../runtime/job-runtime.service";
import { JobRuntimeService } from "../../runtime/job-runtime.service";
import { WORKER_DATABASE } from "../database/database.module";

const hashValue = (value: unknown) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

@Injectable()
export class AiGatewayService {
  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
    private readonly config: WorkerConfig,
    private readonly runtime: JobRuntimeService,
  ) {}

  async structured<T>(
    job: ClaimedWorkerJob,
    userId: string | null,
    capability: string,
    request: StructuredGenerationRequest,
  ): Promise<T> {
    await this.assertRuntimeEnabled();
    const invocation = await this.startInvocation(job, capability, request);
    try {
      await this.reserve(invocation.id, userId, capability, request);
      const adapters = createRuntimeDeepSeekAdaptersFromEnv();
      const result = await this.runtime.withHeartbeat(job, () =>
        adapters.structured.generate<T>(request),
      );
      await this.settle(
        invocation.id,
        job,
        capability,
        result.model,
        result.value,
        result.usage,
      );
      return result.value;
    } catch (error) {
      await this.failAndRelease(invocation.id);
      throw error;
    }
  }

  async streamingText(
    job: ClaimedWorkerJob,
    userId: string | null,
    capability: string,
    request: StreamingGenerationRequest,
  ): Promise<string> {
    await this.assertRuntimeEnabled();
    const invocation = await this.startInvocation(job, capability, request);
    let output = "";
    let usage = { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 };
    let model = this.config.aiModel;
    try {
      await this.reserve(invocation.id, userId, capability, request);
      const adapters = createRuntimeDeepSeekAdaptersFromEnv();
      await this.runtime.withHeartbeat(job, async () => {
        for await (const chunk of adapters.streaming.stream(request)) {
          output += chunk.delta;
          model = chunk.model;
          if (chunk.usage) usage = chunk.usage;
          if (await this.runtime.cancellationRequested(job)) {
            throw new Error("JOB_CANCELLED");
          }
        }
      });
      if (!output.trim()) throw new Error("AI_EMPTY_RESPONSE");
      await this.settle(invocation.id, job, capability, model, output, usage);
      return output;
    } catch (error) {
      await this.failAndRelease(invocation.id);
      throw error;
    }
  }

  private async assertRuntimeEnabled() {
    if (!this.config.aiEnabled) throw new Error("AI_KILL_SWITCH_ENABLED");
    const control = await this.database.runtimeFeatureControl.findUnique({
      where: { key: "runtime-ai" },
    });
    if (control?.enabled === false) throw new Error("AI_KILL_SWITCH_ENABLED");
  }

  private async reserve(
    invocationId: string,
    userId: string | null,
    capability: string,
    request: StructuredGenerationRequest | StreamingGenerationRequest,
  ): Promise<void> {
    const maxTokens = request.maxTokens;
    if (
      typeof maxTokens !== "number" ||
      !Number.isSafeInteger(maxTokens) ||
      maxTokens < 1
    ) {
      throw new Error("AI_MAX_TOKENS_REQUIRED");
    }
    const estimatedInputUnits = Math.ceil(
      Buffer.byteLength(JSON.stringify(request), "utf8") / 4,
    );
    const estimatedUnits = BigInt(estimatedInputUnits + maxTokens);
    const estimatedCostMicros = BigInt(
      Math.ceil(
        estimatedInputUnits * this.config.aiInputUsdPerMillion +
          maxTokens * this.config.aiOutputUsdPerMillion,
      ),
    );
    const now = new Date();

    await this.database.$transaction(async (transaction) => {
      const candidates = await transaction.aIQuotaPolicy.findMany({
        where: {
          capability,
          scope: { in: userId ? ["USER", "SYSTEM"] : ["SYSTEM"] },
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      });
      const policyByBoundary = new Map<string, (typeof candidates)[number]>();
      for (const policy of candidates) {
        const key = `${policy.scope}:${policy.window}`;
        if (!policyByBoundary.has(key)) policyByBoundary.set(key, policy);
      }
      const boundaries =
        policyByBoundary.size > 0
          ? [...policyByBoundary.values()].map((policy) => ({
              scope: policy.scope,
              windowKey: this.windowKey(policy.window, now),
              policy,
            }))
          : [
              {
                scope: userId ? "USER" : "SYSTEM",
                windowKey: this.windowKey("DAILY", now),
                policy: null,
              },
            ];

      for (const boundary of boundaries) {
        const ledgerUserId = boundary.scope === "USER" ? userId : null;
        const lockKey = [
          boundary.scope,
          ledgerUserId ?? "*",
          capability,
          boundary.windowKey,
        ].join(":");
        await transaction.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
        );
        const idempotencyKey = `${invocationId}:reservation:${boundary.scope}:${boundary.windowKey}`;
        const existing = await transaction.aIUsageLedger.findUnique({
          where: { idempotencyKey },
        });
        if (existing) continue;
        const used = await transaction.aIUsageLedger.aggregate({
          where: {
            userId: ledgerUserId,
            capability,
            scope: boundary.scope,
            windowKey: boundary.windowKey,
          },
          _sum: { units: true, costMicros: true },
        });
        if (
          boundary.policy &&
          ((used._sum.units ?? 0n) + estimatedUnits >
            boundary.policy.limitUnits ||
            (used._sum.costMicros ?? 0n) + estimatedCostMicros >
              boundary.policy.limitMicros)
        ) {
          throw new Error("AI_QUOTA_EXCEEDED");
        }
        await transaction.aIUsageLedger.create({
          data: {
            userId: ledgerUserId,
            capability,
            scope: boundary.scope,
            windowKey: boundary.windowKey,
            entryType: "RESERVATION",
            units: estimatedUnits,
            costMicros: estimatedCostMicros,
            idempotencyKey,
          },
        });
      }
    });
  }

  private windowKey(window: string, now: Date): string {
    const day = now.toISOString().slice(0, 10);
    return window === "MONTHLY" ? day.slice(0, 7) : day;
  }

  private async failAndRelease(invocationId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const reservations = await transaction.aIUsageLedger.findMany({
        where: {
          entryType: "RESERVATION",
          idempotencyKey: { startsWith: `${invocationId}:reservation:` },
        },
      });
      await transaction.aIUsageLedger.createMany({
        data: reservations.map((reservation) => ({
          userId: reservation.userId,
          capability: reservation.capability,
          scope: reservation.scope,
          windowKey: reservation.windowKey,
          entryType: "RELEASE",
          units: -reservation.units,
          costMicros: -reservation.costMicros,
          currency: reservation.currency,
          idempotencyKey: `${reservation.idempotencyKey}:release`,
        })),
        skipDuplicates: true,
      });
      await transaction.modelInvocation.updateMany({
        where: { id: invocationId, status: "RUNNING" },
        data: { status: "FAILED", completedAt: new Date() },
      });
    });
  }

  private startInvocation(
    job: ClaimedWorkerJob,
    capability: string,
    input: unknown,
  ) {
    return this.database.modelInvocation.upsert({
      where: { idempotencyKey: `${job.id}:${capability}:${job.attempt}` },
      create: {
        jobId: job.id,
        capability,
        provider: this.config.aiProvider,
        requestedModel: this.config.aiModel,
        promptVersion: `${capability.toLowerCase()}/1`,
        schemaVersion: "1",
        idempotencyKey: `${job.id}:${capability}:${job.attempt}`,
        inputHash: hashValue(input),
        status: "RUNNING",
      },
      update: {},
    });
  }

  private async settle(
    invocationId: string,
    job: ClaimedWorkerJob,
    capability: string,
    model: string,
    output: unknown,
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheHitTokens: number;
    },
  ) {
    const billableInput = Math.max(0, usage.inputTokens - usage.cacheHitTokens);
    const costMicros = BigInt(
      Math.round(
        billableInput * this.config.aiInputUsdPerMillion +
          usage.cacheHitTokens * this.config.aiCacheHitUsdPerMillion +
          usage.outputTokens * this.config.aiOutputUsdPerMillion,
      ),
    );
    await this.database.$transaction(async (transaction) => {
      await transaction.modelInvocation.update({
        where: { id: invocationId },
        data: {
          status: "SUCCEEDED",
          resolvedModel: model,
          outputHash: hashValue(output),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costMicros,
          completedAt: new Date(),
        },
      });
      const reservations = await transaction.aIUsageLedger.findMany({
        where: {
          entryType: "RESERVATION",
          idempotencyKey: { startsWith: `${invocationId}:reservation:` },
        },
      });
      const actualUnits = BigInt(usage.inputTokens + usage.outputTokens);
      await transaction.aIUsageLedger.createMany({
        data: reservations.map((reservation) => ({
          userId: reservation.userId,
          capability,
          scope: reservation.scope,
          windowKey: reservation.windowKey,
          entryType: "SETTLEMENT_ADJUSTMENT",
          units: actualUnits - reservation.units,
          costMicros: costMicros - reservation.costMicros,
          currency: reservation.currency,
          idempotencyKey: `${reservation.idempotencyKey}:settlement`,
        })),
        skipDuplicates: true,
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: "BackgroundJob",
          aggregateId: job.id,
          eventType: "ai.usage.settled",
          eventVersion: "sylis.ai-usage/1",
          payload: { jobId: job.id, invocationId, capability },
        },
      });
    });
  }
}
