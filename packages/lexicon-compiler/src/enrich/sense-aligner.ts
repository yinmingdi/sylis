import { createHash } from "node:crypto";

import type { NormalizedSourceRecord } from "../candidates/candidate-v1";
import type { CompileProgressPort } from "../progress/reporter";
import { senseSimilarity } from "../resolve/sense";
import {
  type SenseAlignmentCandidate,
  senseAlignmentCandidateSchema,
} from "./schemas/sense-alignment";
import { StructuredTaskExecutor } from "./structured-task-executor";

interface SenseReference {
  record: NormalizedSourceRecord;
  sense: NormalizedSourceRecord["senses"][number];
}

function referenceKey(reference: {
  sourceRecordId: string;
  sourceSenseKey: string;
}): string {
  return `${reference.sourceRecordId}:${reference.sourceSenseKey}`;
}

function requiresAlignment(references: SenseReference[]): boolean {
  for (const [index, left] of references.entries()) {
    for (const right of references.slice(index + 1)) {
      if (left.record.sourceRecordId === right.record.sourceRecordId) continue;
      const similarity = senseSimilarity(left.sense, right.sense);
      if (similarity >= 0.2 && similarity < 0.8) return true;
    }
  }
  return false;
}

function validateAlignment(
  candidate: SenseAlignmentCandidate,
  references: SenseReference[],
): string | null {
  const expected = new Set(
    references.map(({ record, sense }) =>
      referenceKey({
        sourceRecordId: record.sourceRecordId,
        sourceSenseKey: sense.sourceSenseKey,
      }),
    ),
  );
  const actual = new Set<string>();
  const localIds = new Set<string>();
  const parentByChild = new Map(
    references.flatMap(({ record, sense }) =>
      sense.parentSourceSenseKey
        ? [
            [
              referenceKey({
                sourceRecordId: record.sourceRecordId,
                sourceSenseKey: sense.sourceSenseKey,
              }),
              referenceKey({
                sourceRecordId: record.sourceRecordId,
                sourceSenseKey: sense.parentSourceSenseKey,
              }),
            ] as const,
          ]
        : [],
    ),
  );
  for (const group of candidate.groups) {
    if (localIds.has(group.localId)) return "DUPLICATE_LOCAL_ID";
    localIds.add(group.localId);
    const groupMembers = new Set(group.members.map(referenceKey));
    for (const member of groupMembers) {
      if (!expected.has(member)) return "UNKNOWN_SOURCE_SENSE";
      if (actual.has(member)) return "DUPLICATE_SOURCE_SENSE";
      if (groupMembers.has(parentByChild.get(member) ?? "")) {
        return "PARENT_CHILD_MERGE_FORBIDDEN";
      }
      actual.add(member);
    }
  }
  return actual.size === expected.size
    ? null
    : "SOURCE_SENSE_COVERAGE_MISMATCH";
}

export async function alignAmbiguousSourceSenses(
  records: NormalizedSourceRecord[],
  executor: StructuredTaskExecutor,
  progress: CompileProgressPort,
): Promise<void> {
  const groups = new Map<string, SenseReference[]>();
  for (const record of records) {
    for (const sense of record.senses) {
      const key = `${record.languageTag}:${record.normalizedHeadword}:${sense.partOfSpeech}`;
      groups.set(key, [...(groups.get(key) ?? []), { record, sense }]);
    }
  }
  const planned = [...groups.entries()]
    .filter(([, references]) => requiresAlignment(references))
    .sort(([left], [right]) => left.localeCompare(right));
  const inputs = planned.map(([targetKey, references]) => ({
    targetKey,
    senses: references.map(({ record, sense }) => ({
      sourceRecordId: record.sourceRecordId,
      sourceSenseKey: sense.sourceSenseKey,
      parentSourceSenseKey: sense.parentSourceSenseKey ?? null,
      adapter: record.adapter,
      definitions: sense.definitions,
      translations: sense.translations,
      tags: sense.tags,
    })),
  }));
  const executions = await executor.executeAll<SenseAlignmentCandidate>(
    planned.map(([, references], index) => ({
      taskType: "SENSE_ALIGNMENT",
      schemaName: "sylis_sense_alignment",
      schema: senseAlignmentCandidateSchema,
      systemPrompt:
        "Partition every supplied source Sense into candidate-local canonical groups. Merge only semantically equivalent Senses of the same Entry; keep polysemy and parent/child Senses separate. Use every source Sense exactly once and return stable reason codes.",
      input: inputs[index],
      maxTokens: 1_200,
      semanticValidator: (candidate) =>
        validateAlignment(candidate, references),
    })),
  );

  for (const [index, [targetKey, references]] of planned.entries()) {
    const execution = executions[index]!;
    const referenceByKey = new Map(
      references.map((reference) => [
        referenceKey({
          sourceRecordId: reference.record.sourceRecordId,
          sourceSenseKey: reference.sense.sourceSenseKey,
        }),
        reference,
      ]),
    );
    for (const group of execution.result.value.groups) {
      const memberKeys = group.members.map(referenceKey).sort();
      const alignmentKey = createHash("sha256")
        .update(execution.candidateKey)
        .update(group.localId)
        .update(memberKeys.join("\u001f"))
        .digest("hex");
      for (const memberKey of memberKeys) {
        const reference = referenceByKey.get(memberKey)!;
        reference.sense.alignmentKey = alignmentKey;
        reference.sense.alignmentCandidateKey = execution.candidateKey;
      }
    }
    await progress.report({
      stage: "SENSE_ALIGNMENT",
      processed: index + 1,
      total: planned.length,
      aiInputTokens: execution.result.usage.inputTokens,
      aiOutputTokens: execution.result.usage.outputTokens,
      aiCostMicros: executor.spentMicros,
      message: targetKey,
    });
  }
}
