import {
  type StructuredTask,
  type StructuredTaskExecutor,
} from "../enrich/structured-task-executor";
import type { GenerationUsage } from "../ports/structured-generation";

export enum LexicalCandidateTaskType {
  SENSE_ALIGNMENT = "SENSE_ALIGNMENT",
  LEARNER_DEFINITION = "LEARNER_DEFINITION",
  EXAMPLE_GENERATION = "EXAMPLE_GENERATION",
  COLLOCATION_ENRICHMENT = "COLLOCATION_ENRICHMENT",
  SYNSEM_FRAME = "SYNSEM_FRAME",
  RELATION_RESOLUTION = "RELATION_RESOLUTION",
}

export enum LexicalCandidateTargetKind {
  SOURCE_SENSE_SET = "SOURCE_SENSE_SET",
  SOURCE_RELATION = "SOURCE_RELATION",
  SENSE = "SENSE",
  ENTRY = "ENTRY",
}

export enum LexicalCandidateRiskClass {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum LexicalCandidateDisposition {
  REVIEW_PENDING = "REVIEW_PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum LexicalCandidatePromotionEntityType {
  SENSE_ALIGNMENT = "SENSE_ALIGNMENT",
  DEFINITION = "DEFINITION",
  TRANSLATION_TEXT = "TRANSLATION_TEXT",
  EXAMPLE = "EXAMPLE",
  COLLOCATION = "COLLOCATION",
  FRAME = "FRAME",
  ENTRY_RELATION = "ENTRY_RELATION",
  SENSE_RELATION = "SENSE_RELATION",
  CONCEPT_RELATION = "CONCEPT_RELATION",
}

export interface LexicalCandidateTarget {
  kind: LexicalCandidateTargetKind;
  targetKey: string;
}

export interface LexicalCandidateEnvelope<T = unknown> {
  schemaVersion: "sylis.ai-candidate/1";
  taskType: LexicalCandidateTaskType;
  target: LexicalCandidateTarget;
  value: T;
}

export interface LexicalCandidateSubmission<T = unknown> {
  candidateKey: string;
  riskClass: LexicalCandidateRiskClass;
  payload: LexicalCandidateEnvelope<T>;
  sourceRecordIds: string[];
  validationSummary: {
    validatorVersion: "lexical-candidate-local/1";
    schemaValid: true;
    semanticValid: true;
  };
}

export interface LexicalCandidateResolution<T = unknown> {
  disposition: LexicalCandidateDisposition;
  candidateRevisionId: string | null;
  payload: LexicalCandidateEnvelope<T> | null;
}

export interface LexicalCandidatePromotionMapping {
  localId: string;
  entityType: LexicalCandidatePromotionEntityType;
  artifactId: string;
}

export interface LexicalCandidatePort {
  resolve<T>(
    candidateKey: string,
    taskType: LexicalCandidateTaskType,
  ): Promise<LexicalCandidateResolution<T> | null>;
  submit<T>(
    candidate: LexicalCandidateSubmission<T>,
  ): Promise<LexicalCandidateResolution<T>>;
  finalizeReviewBatch(): Promise<{
    reviewBatchId: string | null;
    pendingCount: number;
  }>;
}

export class LexicalCandidateReviewPendingError extends Error {
  constructor(
    readonly reviewBatchId: string,
    readonly pendingCount: number,
  ) {
    super(
      `LEXICAL_CANDIDATE_REVIEW_PENDING:batch=${reviewBatchId}:count=${pendingCount}`,
    );
    this.name = "LexicalCandidateReviewPendingError";
  }
}

export interface LexicalCandidateTask<T> extends StructuredTask<T> {
  taskType: LexicalCandidateTaskType;
  target: LexicalCandidateTarget;
  riskClass: LexicalCandidateRiskClass;
  sourceRecordIds: string[];
}

export interface LexicalCandidateOutcome<T> {
  candidateKey: string;
  candidateRevisionId: string | null;
  disposition: LexicalCandidateDisposition;
  value: T | null;
  usage: GenerationUsage;
}

const NO_USAGE: GenerationUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheHitTokens: 0,
};

function outcome<T>(
  candidateKey: string,
  task: LexicalCandidateTask<T>,
  resolution: LexicalCandidateResolution<T>,
  usage: GenerationUsage,
): LexicalCandidateOutcome<T> {
  if (
    resolution.disposition === LexicalCandidateDisposition.APPROVED &&
    (!resolution.candidateRevisionId || !resolution.payload)
  ) {
    throw new Error(`APPROVED_LEXICAL_CANDIDATE_INCOMPLETE:${candidateKey}`);
  }
  if (
    resolution.payload &&
    (resolution.payload.schemaVersion !== "sylis.ai-candidate/1" ||
      resolution.payload.taskType !== task.taskType ||
      resolution.payload.target.kind !== task.target.kind ||
      resolution.payload.target.targetKey !== task.target.targetKey)
  ) {
    throw new Error(`LEXICAL_CANDIDATE_ENVELOPE_MISMATCH:${candidateKey}`);
  }
  return {
    candidateKey,
    candidateRevisionId: resolution.candidateRevisionId,
    disposition: resolution.disposition,
    value:
      resolution.disposition === LexicalCandidateDisposition.APPROVED
        ? (resolution.payload!.value as T)
        : null,
    usage,
  };
}

interface LexicalCandidateTaskGroup<T> {
  candidateKey: string;
  task: LexicalCandidateTask<T>;
  sourceRecordIds: Set<string>;
  resultIndexes: number[];
}

function assertSameCandidateIdentity<T>(
  group: LexicalCandidateTaskGroup<T>,
  task: LexicalCandidateTask<T>,
): void {
  if (
    group.task.taskType !== task.taskType ||
    group.task.target.kind !== task.target.kind ||
    group.task.target.targetKey !== task.target.targetKey ||
    group.task.riskClass !== task.riskClass ||
    group.task.schemaName !== task.schemaName ||
    group.task.systemPrompt !== task.systemPrompt ||
    group.task.maxTokens !== task.maxTokens
  ) {
    throw new Error(`LEXICAL_CANDIDATE_KEY_COLLISION:${group.candidateKey}`);
  }
}

export async function executeLexicalCandidateTasks<T>(
  executor: StructuredTaskExecutor,
  port: LexicalCandidatePort,
  tasks: LexicalCandidateTask<T>[],
): Promise<Array<LexicalCandidateOutcome<T>>> {
  const groupsByKey = new Map<string, LexicalCandidateTaskGroup<T>>();
  for (const [index, sourceTask] of tasks.entries()) {
    const task = { ...sourceTask, candidateIdentity: sourceTask.target };
    const candidateKey = executor.candidateKey(
      task.taskType,
      task.input,
      task.candidateIdentity,
    );
    const existing = groupsByKey.get(candidateKey);
    if (existing) {
      assertSameCandidateIdentity(existing, task);
      existing.resultIndexes.push(index);
      for (const sourceRecordId of task.sourceRecordIds) {
        existing.sourceRecordIds.add(sourceRecordId);
      }
      continue;
    }
    groupsByKey.set(candidateKey, {
      candidateKey,
      task,
      sourceRecordIds: new Set(task.sourceRecordIds),
      resultIndexes: [index],
    });
  }
  const groups = [...groupsByKey.values()];
  const resolved = await Promise.all(
    groups.map(async (group) => ({
      group,
      existing: await port.resolve<T>(group.candidateKey, group.task.taskType),
    })),
  );
  const missing = resolved.filter((item) => item.existing === null);
  const generated = await executor.executeAll<T>(
    missing.map(({ group }) => group.task),
  );
  const generatedByKey = new Map(
    generated.map((execution) => [execution.candidateKey, execution]),
  );

  const results = new Array<LexicalCandidateOutcome<T>>(tasks.length);
  for (const item of resolved) {
    let candidateOutcome: LexicalCandidateOutcome<T>;
    if (item.existing) {
      if (
        item.existing.disposition === LexicalCandidateDisposition.APPROVED &&
        item.existing.payload
      ) {
        executor.validateCandidate(
          item.group.task,
          item.existing.payload.value,
        );
      }
      candidateOutcome = outcome(
        item.group.candidateKey,
        item.group.task,
        item.existing,
        NO_USAGE,
      );
    } else {
      const execution = generatedByKey.get(item.group.candidateKey);
      if (!execution) {
        throw new Error(
          `LEXICAL_CANDIDATE_EXECUTION_MISSING:${item.group.candidateKey}`,
        );
      }
      const sourceRecordIds = [...item.group.sourceRecordIds].sort();
      if (sourceRecordIds.length === 0) {
        throw new Error(
          `LEXICAL_CANDIDATE_EVIDENCE_REQUIRED:${item.group.candidateKey}`,
        );
      }
      const resolution = await port.submit<T>({
        candidateKey: item.group.candidateKey,
        riskClass: item.group.task.riskClass,
        payload: {
          schemaVersion: "sylis.ai-candidate/1",
          taskType: item.group.task.taskType,
          target: item.group.task.target,
          value: execution.result.value,
        },
        sourceRecordIds,
        validationSummary: {
          validatorVersion: "lexical-candidate-local/1",
          schemaValid: true,
          semanticValid: true,
        },
      });
      if (
        resolution.disposition === LexicalCandidateDisposition.APPROVED &&
        resolution.payload
      ) {
        executor.validateCandidate(item.group.task, resolution.payload.value);
      }
      candidateOutcome = outcome(
        item.group.candidateKey,
        item.group.task,
        resolution,
        execution.result.usage,
      );
    }
    for (const [position, resultIndex] of item.group.resultIndexes.entries()) {
      results[resultIndex] =
        position === 0
          ? candidateOutcome
          : { ...candidateOutcome, usage: NO_USAGE };
    }
  }
  return results;
}
