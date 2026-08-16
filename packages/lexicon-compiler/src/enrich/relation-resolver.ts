import type {
  CandidateRelation,
  CandidateSense,
  NormalizedSourceRecord,
} from "../candidates/candidate-v1";
import {
  executeLexicalCandidateTasks,
  type LexicalCandidatePort,
  LexicalCandidateRiskClass,
  LexicalCandidateTargetKind,
  LexicalCandidateTaskType,
} from "../candidates/lexical-candidate";
import { normalizeIdentityText } from "../normalize/text-profile";
import { CompileStage, type CompileProgressPort } from "../progress/reporter";
import { semanticSignature } from "../resolve/sense";
import {
  RelationResolutionDecision,
  type RelationResolutionCandidate,
  relationResolutionCandidateSchema,
} from "./schemas/relation-resolution";
import { StructuredTaskExecutor } from "./structured-task-executor";

interface SourceSenseReference {
  record: NormalizedSourceRecord;
  sense: CandidateSense;
}

interface PendingRelationReference {
  record: NormalizedSourceRecord;
  sourceSense: CandidateSense;
  relation: CandidateRelation;
  candidates: SourceSenseReference[];
}

function referenceKey(reference: {
  sourceRecordId: string;
  sourceSenseKey: string;
}): string {
  return `${reference.sourceRecordId}:${reference.sourceSenseKey}`;
}

function canonicalCandidateKey(reference: SourceSenseReference): string {
  return (
    reference.sense.alignmentKey ??
    reference.sense.conceptExternalId ??
    semanticSignature(reference.sense)
  );
}

function chooseDeterministically(
  relation: CandidateRelation,
  candidates: SourceSenseReference[],
): SourceSenseReference | null {
  const external = relation.targetExternalId
    ? candidates.filter(
        (candidate) =>
          candidate.sense.conceptExternalId === relation.targetExternalId,
      )
    : [];
  const eligible = external.length > 0 ? external : candidates;
  const groups = new Map<string, SourceSenseReference[]>();
  for (const candidate of eligible) {
    const key = canonicalCandidateKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  if (groups.size !== 1) return null;
  return [...groups.values()][0].sort((left, right) =>
    referenceKey({
      sourceRecordId: left.record.sourceRecordId,
      sourceSenseKey: left.sense.sourceSenseKey,
    }).localeCompare(
      referenceKey({
        sourceRecordId: right.record.sourceRecordId,
        sourceSenseKey: right.sense.sourceSenseKey,
      }),
    ),
  )[0];
}

function applyResolution(
  relation: CandidateRelation,
  reference: SourceSenseReference,
  candidateKey?: string,
  candidateRevisionId?: string,
): void {
  relation.resolvedTargetSourceRecordId = reference.record.sourceRecordId;
  relation.resolvedTargetSourceSenseKey = reference.sense.sourceSenseKey;
  relation.resolutionCandidateKey = candidateKey;
  relation.resolutionCandidateRevisionId = candidateRevisionId;
}

function validateResolution(
  candidate: RelationResolutionCandidate,
  candidates: SourceSenseReference[],
): string | null {
  if (candidate.decision === RelationResolutionDecision.UNRESOLVED) {
    return candidate.target === null ? null : "UNRESOLVED_WITH_TARGET";
  }
  if (!candidate.target) return "RESOLVED_WITHOUT_TARGET";
  const allowed = new Set(
    candidates.map(({ record, sense }) =>
      referenceKey({
        sourceRecordId: record.sourceRecordId,
        sourceSenseKey: sense.sourceSenseKey,
      }),
    ),
  );
  return allowed.has(referenceKey(candidate.target))
    ? null
    : "TARGET_OUTSIDE_CANDIDATE_SET";
}

export async function resolveAmbiguousRelations(
  records: NormalizedSourceRecord[],
  executor: StructuredTaskExecutor | undefined,
  candidatePort: LexicalCandidatePort | undefined,
  progress: CompileProgressPort,
): Promise<void> {
  const sensesByHeadwordAndPos = new Map<string, SourceSenseReference[]>();
  for (const record of records) {
    for (const sense of record.senses) {
      const key = `${record.languageTag}:${record.normalizedHeadword}:${sense.partOfSpeech}`;
      sensesByHeadwordAndPos.set(key, [
        ...(sensesByHeadwordAndPos.get(key) ?? []),
        { record, sense },
      ]);
    }
  }

  const ambiguous: PendingRelationReference[] = [];
  let deterministicCount = 0;
  for (const record of records) {
    for (const sourceSense of record.senses) {
      for (const relation of sourceSense.relations) {
        const targetKey = `${record.languageTag}:${normalizeIdentityText(relation.targetText)}:${sourceSense.partOfSpeech}`;
        const candidates = sensesByHeadwordAndPos.get(targetKey) ?? [];
        const deterministic = chooseDeterministically(relation, candidates);
        if (deterministic) {
          applyResolution(relation, deterministic);
          deterministicCount += 1;
        } else if (candidates.length > 0) {
          ambiguous.push({ record, sourceSense, relation, candidates });
        }
      }
    }
  }

  ambiguous.sort((left, right) => {
    const leftKey = `${left.record.sourceRecordId}:${left.sourceSense.sourceSenseKey}:${left.relation.relationType}:${left.relation.targetText}`;
    const rightKey = `${right.record.sourceRecordId}:${right.sourceSense.sourceSenseKey}:${right.relation.relationType}:${right.relation.targetText}`;
    return leftKey.localeCompare(rightKey);
  });
  if (!executor || !candidatePort || ambiguous.length === 0) {
    await progress.report({
      stage: CompileStage.RELATION_RESOLUTION,
      processed: 0,
      total: ambiguous.length,
      message: `${deterministicCount} deterministic; ${ambiguous.length} unresolved`,
    });
    return;
  }
  const executions =
    await executeLexicalCandidateTasks<RelationResolutionCandidate>(
      executor,
      candidatePort,
      ambiguous.map((pending) => ({
        taskType: LexicalCandidateTaskType.RELATION_RESOLUTION,
        target: {
          kind: LexicalCandidateTargetKind.SOURCE_RELATION,
          targetKey: [
            pending.record.sourceRecordId,
            pending.sourceSense.sourceSenseKey,
            pending.relation.relationType,
            pending.relation.targetText,
          ].join(":"),
        },
        riskClass: LexicalCandidateRiskClass.HIGH,
        sourceRecordIds: [
          pending.record.sourceRecordId,
          ...pending.candidates.map(
            (candidate) => candidate.record.sourceRecordId,
          ),
        ],
        schemaName: "sylis_relation_resolution",
        schema: relationResolutionCandidateSchema,
        systemPrompt:
          "Resolve one source relation to exactly one supplied target Sense candidate, or return UNRESOLVED. Respect relation level and the source Sense meaning; never create a target or change relation type.",
        input: {
          source: {
            sourceRecordId: pending.record.sourceRecordId,
            sourceSenseKey: pending.sourceSense.sourceSenseKey,
            definitions: pending.sourceSense.definitions,
            translations: pending.sourceSense.translations,
          },
          relation: {
            relationType: pending.relation.relationType,
            targetText: pending.relation.targetText,
            targetExternalId: pending.relation.targetExternalId ?? null,
          },
          candidates: pending.candidates.map(({ record, sense }) => ({
            sourceRecordId: record.sourceRecordId,
            sourceSenseKey: sense.sourceSenseKey,
            definitions: sense.definitions,
            translations: sense.translations,
            conceptExternalId: sense.conceptExternalId ?? null,
          })),
        },
        maxTokens: 500,
        semanticValidator: (candidate) =>
          validateResolution(candidate, pending.candidates),
      })),
    );
  for (const [index, pending] of ambiguous.entries()) {
    const execution = executions[index]!;
    if (
      execution.value?.decision === RelationResolutionDecision.RESOLVED &&
      execution.value.target
    ) {
      const targetKey = referenceKey(execution.value.target);
      const target = pending.candidates.find(
        ({ record, sense }) =>
          referenceKey({
            sourceRecordId: record.sourceRecordId,
            sourceSenseKey: sense.sourceSenseKey,
          }) === targetKey,
      )!;
      applyResolution(
        pending.relation,
        target,
        execution.candidateKey,
        execution.candidateRevisionId!,
      );
    }
    await progress.report({
      stage: CompileStage.RELATION_RESOLUTION,
      processed: index + 1,
      total: ambiguous.length,
      aiInputTokens: execution.usage.inputTokens,
      aiOutputTokens: execution.usage.outputTokens,
      aiCostMicros: executor.spentMicros,
      message: `${pending.relation.relationType}:${pending.relation.targetText}:${execution.disposition}`,
    });
  }
}
