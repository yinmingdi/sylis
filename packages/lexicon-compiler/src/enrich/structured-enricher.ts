import type { SylisLexiconArtifactV1 } from "@sylis/lexicon-contracts";

import { ensureGeneratedProvenance } from "./generated-provenance";
import type { CompileProgressPort } from "../progress/reporter";
import { stableId } from "../sources/source-context";
import {
  type LearnerDefinitionCandidate,
  learnerDefinitionCandidateSchema,
} from "./schemas/learner-definition";
import { StructuredTaskExecutor } from "./structured-task-executor";

export async function enrichArtifactDefinitions(
  artifact: SylisLexiconArtifactV1,
  executor: StructuredTaskExecutor,
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
  const executions = await executor.executeAll<LearnerDefinitionCandidate>(
    plans.map((plan) => ({
      taskType: "LEARNER_DEFINITION",
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
    const { candidateKey: key, result } = execution;

    const upstreamProvenanceId = sense.provenanceId;
    const addDefinition =
      existingDefinitions.length === 0 && result.value.definition !== null;
    const addTranslation =
      existingTranslations.length === 0 && result.value.translation !== null;
    const provenanceId =
      addDefinition || addTranslation
        ? ensureGeneratedProvenance(
            artifact,
            key,
            result.value,
            upstreamProvenanceId,
            "Schema-valid generated learner content candidate.",
          )
        : null;
    if (addDefinition && result.value.definition && provenanceId) {
      artifact.lexicon.definitions.push({
        id: stableId("definition", sense.senseId, "generated", key),
        senseId: sense.senseId,
        languageTag: result.value.definition.languageTag,
        definitionType: "LEARNER_GENERATED",
        text: result.value.definition.text,
        displayOrder: 1,
        provenanceId,
      });
    }
    if (addTranslation && result.value.translation && provenanceId) {
      artifact.lexicon.translationTexts.push({
        id: stableId("translation", sense.senseId, "generated", key),
        senseId: sense.senseId,
        languageTag: result.value.translation.languageTag,
        text: result.value.translation.text,
        registerTermId: null,
        displayOrder: 1,
        provenanceId,
      });
    }
    await progress.report({
      stage: "FACT_GAP_FILL",
      processed: index + 1,
      total: senses.length,
      aiInputTokens: result.usage.inputTokens,
      aiOutputTokens: result.usage.outputTokens,
      aiCostMicros: executor.spentMicros,
    });
  }
}
