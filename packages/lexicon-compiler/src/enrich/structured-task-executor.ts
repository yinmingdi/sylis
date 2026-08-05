import type {
  GenerationUsage,
  JsonSchema,
  StructuredGenerationIdentity,
  StructuredGenerationPort,
  StructuredGenerationResult,
} from "@sylis/ai-provider";
import Ajv, { type ValidateFunction } from "ajv";
import { createHash } from "node:crypto";

import { BudgetLedger, type TokenPricing } from "./budget";
import { type CandidateCache, MemoryCandidateCache } from "./candidate-cache";
import { canonicalJsonChunks } from "../export/canonicalize";

export interface StructuredEnrichmentOptions {
  enabled: boolean;
  budgetUsd: string;
  concurrency: number;
  pricing: TokenPricing;
  promptVersion: string;
  schemaVersion: string;
  modelPolicyVersion: string;
  requestedProvider: string;
  requestedModel: string;
}

export interface StructuredTaskExecutorDependencies {
  generation: StructuredGenerationPort;
  resolvedIdentity: StructuredGenerationIdentity;
  cache?: CandidateCache;
}

export interface StructuredTask<T> {
  taskType: string;
  schemaName: string;
  schema: JsonSchema;
  systemPrompt: string;
  input: unknown;
  maxTokens: number;
  semanticValidator?: (candidate: T) => string | null;
}

export interface StructuredTaskResult<T> {
  candidateKey: string;
  result: StructuredGenerationResult<T>;
  cacheHit: boolean;
  chargedMicros: number;
  spentMicros: number;
}

export interface StructuredTaskMetrics {
  taskCount: number;
  taskCounts: Record<string, number>;
  providerCalls: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
  providerCacheHitTokens: number;
  costMicros: number;
  validationRejects: number;
}

function canonicalJson(value: unknown): string {
  return [...canonicalJsonChunks(value)].join("");
}

export class StructuredTaskExecutor {
  private readonly ajv = new Ajv({ allErrors: true, strict: true });
  private readonly budget: BudgetLedger;
  private readonly cache: CandidateCache;
  private readonly taskCounts = new Map<string, number>();
  private taskCount = 0;
  private providerCalls = 0;
  private cacheHits = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private providerCacheHitTokens = 0;
  private validationRejects = 0;

  constructor(
    private readonly options: StructuredEnrichmentOptions,
    private readonly dependencies: StructuredTaskExecutorDependencies,
  ) {
    if (
      !Number.isSafeInteger(options.concurrency) ||
      options.concurrency < 1 ||
      options.concurrency > 32
    ) {
      throw new Error("AI concurrency must be an integer from 1 to 32.");
    }
    this.budget = new BudgetLedger(options.budgetUsd, options.pricing);
    this.cache = dependencies.cache ?? new MemoryCandidateCache();
  }

  candidateKey(taskType: string, input: unknown): string {
    const payload = canonicalJson({
      taskType,
      input,
      promptVersion: this.options.promptVersion,
      schemaVersion: this.options.schemaVersion,
      modelPolicyVersion: this.options.modelPolicyVersion,
      requestedProvider: this.options.requestedProvider,
      requestedModel: this.options.requestedModel,
      resolvedIdentity: this.dependencies.resolvedIdentity,
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  private maximumUsage<T>(task: StructuredTask<T>): GenerationUsage {
    const inputBytes = Buffer.byteLength(
      `${task.systemPrompt}\n${task.schemaName}\n${canonicalJson(task.schema)}\n${canonicalJson(task.input)}`,
      "utf8",
    );
    return {
      inputTokens: inputBytes + 1_024,
      outputTokens: task.maxTokens,
      cacheHitTokens: 0,
    };
  }

  async execute<T>(task: StructuredTask<T>): Promise<StructuredTaskResult<T>> {
    this.taskCount += 1;
    this.taskCounts.set(
      task.taskType,
      (this.taskCounts.get(task.taskType) ?? 0) + 1,
    );
    const candidateKey = this.candidateKey(task.taskType, task.input);
    const validate = this.ajv.compile(task.schema) as ValidateFunction<T>;
    let result = await this.cache.get<T>(candidateKey);
    const cacheHit = result !== null;
    if (cacheHit) this.cacheHits += 1;
    let chargedMicros = 0;
    if (!result) {
      const reservation = this.budget.reserve(this.maximumUsage(task));
      let pendingReservation = reservation;
      try {
        this.providerCalls += 1;
        result = await this.dependencies.generation.generate<T>({
          taskType: task.taskType,
          schemaName: task.schemaName,
          schema: task.schema,
          systemPrompt: task.systemPrompt,
          input: task.input,
          candidateKey,
          temperature: 0,
          maxTokens: task.maxTokens,
        });
        this.inputTokens += result.usage.inputTokens;
        this.outputTokens += result.usage.outputTokens;
        this.providerCacheHitTokens += result.usage.cacheHitTokens;
        chargedMicros = this.budget.settle(reservation, result.usage);
        pendingReservation = 0n;
      } finally {
        if (pendingReservation > 0n) {
          this.budget.release(pendingReservation);
        }
      }
    }
    if (
      result.provider !== this.dependencies.resolvedIdentity.provider ||
      result.model !== this.dependencies.resolvedIdentity.model
    ) {
      throw new Error(
        `AI_MODEL_IDENTITY_MISMATCH:expected=${this.dependencies.resolvedIdentity.provider}/${this.dependencies.resolvedIdentity.model}:received=${result.provider}/${result.model}`,
      );
    }
    if (!validate(result.value)) {
      this.validationRejects += 1;
      throw new Error(
        `AI_CANDIDATE_INVALID:${task.taskType}:${this.ajv.errorsText(validate.errors)}`,
      );
    }
    const semanticIssue = task.semanticValidator?.(result.value);
    if (semanticIssue) {
      this.validationRejects += 1;
      throw new Error(
        `AI_CANDIDATE_SEMANTIC_INVALID:${task.taskType}:${semanticIssue}`,
      );
    }
    if (!cacheHit) await this.cache.set(candidateKey, result);
    return {
      candidateKey,
      result,
      cacheHit,
      chargedMicros,
      spentMicros: this.budget.spent,
    };
  }

  async executeAll<T>(
    tasks: StructuredTask<T>[],
  ): Promise<Array<StructuredTaskResult<T>>> {
    const results = new Array<StructuredTaskResult<T>>(tasks.length);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        const task = tasks[index];
        if (!task) return;
        results[index] = await this.execute(task);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(tasks.length, this.options.concurrency) },
        () => worker(),
      ),
    );
    return results;
  }

  get spentMicros(): number {
    return this.budget.spent;
  }

  get metrics(): StructuredTaskMetrics {
    return {
      taskCount: this.taskCount,
      taskCounts: Object.fromEntries(
        [...this.taskCounts].sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      ),
      providerCalls: this.providerCalls,
      cacheHits: this.cacheHits,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      providerCacheHitTokens: this.providerCacheHitTokens,
      costMicros: this.budget.spent,
      validationRejects: this.validationRejects,
    };
  }
}
