import type { SylisLexiconArtifactV1 } from "@sylis/lexicon-artifact";

import {
  ensureDerivedCandidateProvenance,
  recordCandidatePromotionLineage,
  sourceRecordIdsForProvenance,
} from "../candidates/candidate-provenance";
import {
  executeLexicalCandidateTasks,
  type LexicalCandidatePort,
  LexicalCandidatePromotionEntityType,
  LexicalCandidateRiskClass,
  LexicalCandidateTargetKind,
  LexicalCandidateTaskType,
} from "../candidates/lexical-candidate";
import { CompileStage, type CompileProgressPort } from "../progress/reporter";
import { stableId } from "../sources/source-context";
import {
  type LearnerDefinitionCandidate,
  learnerDefinitionCandidateSchema,
} from "./schemas/learner-definition";
import { StructuredTaskExecutor } from "./structured-task-executor";

export async function enrichArtifactDefinitions(
  artifact: SylisLexiconArtifactV1,
  executor: StructuredTaskExecutor,
  candidatePort: LexicalCandidatePort,
  progress: CompileProgressPort,
): Promise<void> {
  const senses = artifact.lexicon.senseRevisions.filter((sense) => {
    const hasDefinition = artifact.lexicon.definitions.some(
      (definition) => definition.senseId === sense.senseId,
    );
    const hasTranslation = artifact.lexicon.translationTexts.some(
      (translation) => translation.senseId === sense.senseId,
    );
    return !hasDefinition || !hasTranslation;
  });

  const plans = senses.map((sense) => {
    const entry = artifact.lexicon.entryRevisions.find(
      (candidate) => candidate.entryId === sense.entryId,
    )!;
    const headword = artifact.lexicon.headwordRevisions.find(
      (candidate) => candidate.headwordId === entry.headwordId,
    )!;
    const existingDefinitions = artifact.lexicon.definitions
      .filter((value) => value.senseId === sense.senseId)
      .map((value) => value.text);
    const existingTranslations = artifact.lexicon.translationTexts
      .filter((value) => value.senseId === sense.senseId)
      .map((value) => value.text);
    return {
      sense,
      existingDefinitions,
      existingTranslations,
      input: {
        headword: headword.displayText,
        partOfSpeech: entry.partOfSpeech,
        senseId: sense.senseId,
        definitions: existingDefinitions,
        translations: existingTranslations,
      },
    };
  });
  const executions =
    await executeLexicalCandidateTasks<LearnerDefinitionCandidate>(
      executor,
      candidatePort,
      plans.map((plan) => ({
        taskType: LexicalCandidateTaskType.LEARNER_DEFINITION,
        target: {
          kind: LexicalCandidateTargetKind.SENSE,
          targetKey: plan.sense.senseId,
        },
        riskClass: LexicalCandidateRiskClass.MEDIUM,
        sourceRecordIds: sourceRecordIdsForProvenance(
          artifact,
          plan.sense.provenanceId,
        ),
        schemaName: "sylis_learner_definition",
        schema: learnerDefinitionCandidateSchema,
        systemPrompt:
          "Generate only a short learner definition or translation supported by the supplied Sense evidence. Return null when evidence is insufficient. Do not create pronunciation, frequency, citation, CEFR, or etymology facts.",
        input: plan.input,
        maxTokens: 300,
      })),
    );

  for (const [index, plan] of plans.entries()) {
    const execution = executions[index]!;
    const { sense, existingDefinitions, existingTranslations } = plan;
    const { candidateKey: key, value, usage } = execution;

    const upstreamProvenanceId = sense.provenanceId;
    const addDefinition =
      existingDefinitions.length === 0 && Boolean(value?.definition);
    const addTranslation =
      existingTranslations.length === 0 && Boolean(value?.translation);
    const provenanceId =
      value &&
      execution.candidateRevisionId &&
      (addDefinition || addTranslation)
        ? ensureDerivedCandidateProvenance(
            artifact,
            key,
            execution.candidateRevisionId,
            value,
            upstreamProvenanceId,
            "Approved learner definition candidate derived from source-backed Sense evidence.",
          )
        : null;
    if (addDefinition && value?.definition && provenanceId) {
      const definitionId = stableId(
        "definition",
        sense.senseId,
        "generated",
        key,
      );
      artifact.lexicon.definitions.push({
        id: definitionId,
        senseId: sense.senseId,
        languageTag: value.definition.languageTag,
        definitionType: "LEARNER_GENERATED",
        text: value.definition.text,
        displayOrder: 1,
        provenanceId,
      });
      recordCandidatePromotionLineage(
        artifact,
        execution.candidateRevisionId!,
        "definition",
        LexicalCandidatePromotionEntityType.DEFINITION,
        definitionId,
      );
    }
    if (addTranslation && value?.translation && provenanceId) {
      const translationId = stableId(
        "translation",
        sense.senseId,
        "generated",
        key,
      );
      artifact.lexicon.translationTexts.push({
        id: translationId,
        senseId: sense.senseId,
        languageTag: value.translation.languageTag,
        text: value.translation.text,
        registerTermId: null,
        displayOrder: 1,
        provenanceId,
      });
      recordCandidatePromotionLineage(
        artifact,
        execution.candidateRevisionId!,
        "translation:zh-CN",
        LexicalCandidatePromotionEntityType.TRANSLATION_TEXT,
        translationId,
      );
    }
    await progress.report({
      stage: CompileStage.FACT_GAP_FILL,
      processed: index + 1,
      total: senses.length,
      aiInputTokens: usage.inputTokens,
      aiOutputTokens: usage.outputTokens,
      aiCostMicros: executor.spentMicros,
    });
  }
}
