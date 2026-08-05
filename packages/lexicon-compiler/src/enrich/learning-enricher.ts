import type { SylisLexiconArtifactV1 } from "@sylis/lexicon-contracts";
import { createHash } from "node:crypto";

import { ensureGeneratedProvenance } from "./generated-provenance";
import { canonicalJsonChunks } from "../export/canonicalize";
import type {
  RichTargetSelector,
  RichTargetSet,
  SourceManifest,
} from "../manifest/source-manifest";
import {
  normalizeComparableText,
  normalizeIdentityText,
} from "../normalize/text-profile";
import type { CompileProgressPort } from "../progress/reporter";
import { stableId } from "../sources/source-context";
import {
  type StudyHintCandidate,
  studyHintCandidateSchema,
} from "./schemas/fact-enrichment";
import {
  type CandidateVerification,
  candidateVerificationSchema,
  type ExerciseGenerationCandidate,
  exerciseGenerationCandidateSchema,
  type PedagogicalMaterialGenerationCandidate,
  pedagogicalMaterialGenerationCandidateSchema,
} from "./schemas/learning-enrichment";
import { StructuredTaskExecutor } from "./structured-task-executor";

interface ResolvedRichTarget {
  selector: RichTargetSelector;
  sense: SylisLexiconArtifactV1["lexicon"]["senseRevisions"][number];
  entry: SylisLexiconArtifactV1["lexicon"]["entryRevisions"][number];
  headword: SylisLexiconArtifactV1["lexicon"]["headwordRevisions"][number];
  definitions: SylisLexiconArtifactV1["lexicon"]["definitions"];
  translations: SylisLexiconArtifactV1["lexicon"]["translationTexts"];
  forms: string[];
}

function contentHash(value: unknown): string {
  const hash = createHash("sha256");
  for (const chunk of canonicalJsonChunks(value)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

function resolveRichTargets(
  artifact: SylisLexiconArtifactV1,
  targetSet: RichTargetSet,
): ResolvedRichTarget[] {
  return [...targetSet.targets]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((selector) => {
      const normalizedHeadword = normalizeIdentityText(selector.headword);
      const headwords = artifact.lexicon.headwordRevisions.filter(
        (headword) => headword.normalizedText === normalizedHeadword,
      );
      const headword = headwords.find((candidate) =>
        artifact.lexicon.headwords.some(
          (identity) =>
            identity.id === candidate.headwordId &&
            identity.identityKey.startsWith(`${selector.languageTag}:`),
        ),
      );
      const entry = headword
        ? artifact.lexicon.entryRevisions.find(
            (candidate) =>
              candidate.headwordId === headword.headwordId &&
              candidate.partOfSpeech === selector.partOfSpeech,
          )
        : undefined;
      const definitionNeedle = normalizeComparableText(
        selector.senseDefinitionContains,
      );
      const senses = entry
        ? artifact.lexicon.senseRevisions.filter(
            (sense) =>
              sense.entryId === entry.entryId &&
              artifact.lexicon.definitions.some(
                (definition) =>
                  definition.senseId === sense.senseId &&
                  normalizeComparableText(definition.text).includes(
                    definitionNeedle,
                  ),
              ),
          )
        : [];
      if (!headword || !entry || senses.length !== 1) {
        throw new Error(`RICH_TARGET_RESOLUTION_FAILED:${selector.key}`);
      }
      const sense = senses[0];
      const formIds = new Set(
        artifact.lexicon.forms
          .filter((form) => form.entryId === entry.entryId)
          .map((form) => form.id),
      );
      return {
        selector,
        sense,
        entry,
        headword,
        definitions: artifact.lexicon.definitions.filter(
          (definition) => definition.senseId === sense.senseId,
        ),
        translations: artifact.lexicon.translationTexts.filter(
          (translation) => translation.senseId === sense.senseId,
        ),
        forms: artifact.lexicon.formRepresentations
          .filter(
            (representation) =>
              formIds.has(representation.formId) &&
              representation.representationType === "WRITTEN",
          )
          .map((representation) => representation.text),
      };
    });
}

function lexicalEvidence(target: ResolvedRichTarget) {
  return {
    selectorKey: target.selector.key,
    headword: target.headword.displayText,
    partOfSpeech: target.entry.partOfSpeech,
    senseId: target.sense.senseId,
    definitions: target.definitions.map((definition) => definition.text),
    translations: target.translations.map((translation) => translation.text),
    forms: target.forms,
  };
}

function upstreamProvenance(target: ResolvedRichTarget): string[] {
  return [
    target.sense.provenanceId,
    ...target.definitions.map((definition) => definition.provenanceId),
    ...target.translations.map((translation) => translation.provenanceId),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function matchingObjective(artifact: SylisLexiconArtifactV1, senseId: string) {
  const revisionIds = new Set(
    artifact.learning.objectiveSubjects
      .filter(
        (subject) =>
          subject.subjectRole === "PRIMARY" &&
          subject.target.targetKind === "SENSE" &&
          subject.target.targetId === senseId,
      )
      .map((subject) => subject.learningObjectiveRevisionId),
  );
  return artifact.learning.objectiveRevisions.find(
    (revision) =>
      revisionIds.has(revision.id) &&
      revision.knowledgeFacet === "MEANING_FORM_MEANING" &&
      revision.retrievalDirection === "RECEPTIVE",
  );
}

function findMention(text: string, forms: string[]) {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const textSegments = [...segmenter.segment(text.normalize("NFC"))].map(
    ({ segment }) => segment,
  );
  const comparableText = textSegments.map((segment) =>
    segment.toLocaleLowerCase("en"),
  );
  for (const form of forms) {
    const formSegments = [...segmenter.segment(form.normalize("NFC"))].map(
      ({ segment }) => segment,
    );
    const comparableForm = formSegments.map((segment) =>
      segment.toLocaleLowerCase("en"),
    );
    for (
      let start = 0;
      start <= comparableText.length - comparableForm.length;
      start += 1
    ) {
      if (
        comparableForm.every(
          (segment, offset) => comparableText[start + offset] === segment,
        )
      ) {
        return { startOffset: start, endOffset: start + comparableForm.length };
      }
    }
  }
  return null;
}

function validateMaterial(
  candidate: PedagogicalMaterialGenerationCandidate,
  kind: "MNEMONIC" | "MICRO_STORY",
  target: ResolvedRichTarget,
): string | null {
  if (candidate.materialKind !== kind) return "MATERIAL_KIND_MISMATCH";
  if (kind === "MNEMONIC") {
    const text = candidate.blocks.map((block) => block.text).join(" ");
    if (/\b(?:etymology|originates?|derived from|comes from)\b/i.test(text)) {
      return "MNEMONIC_FALSE_ETYMOLOGY_RISK";
    }
    return candidate.blocks.some(
      (block) =>
        block.languageTag === "zh-CN" &&
        (block.role === "EXPLANATION" || block.role === "TAKEAWAY"),
    )
      ? null
      : "MNEMONIC_BLOCKS_INVALID";
  }
  const story = candidate.blocks.find(
    (block) => block.role === "STORY" && block.languageTag === "en",
  );
  const translation = candidate.blocks.find(
    (block) => block.role === "TRANSLATION" && block.languageTag === "zh-CN",
  );
  if (!story || !translation) return "MICRO_STORY_BLOCKS_INVALID";
  return findMention(story.text, target.forms)
    ? null
    : "MICRO_STORY_TARGET_NOT_MENTIONED";
}

function attachMaterialStimulus(
  artifact: SylisLexiconArtifactV1,
  target: ResolvedRichTarget,
  materialRevisionId: string,
  provenanceId: string,
): void {
  const objectiveRevisionIds = new Set(
    artifact.learning.objectiveSubjects
      .filter(
        (subject) =>
          subject.subjectRole === "PRIMARY" &&
          subject.target.targetKind === "SENSE" &&
          subject.target.targetId === target.sense.senseId,
      )
      .map((subject) => subject.learningObjectiveRevisionId),
  );
  const exercise = artifact.learning.exerciseRevisions.find(
    (revision) =>
      objectiveRevisionIds.has(revision.learningObjectiveRevisionId) &&
      revision.exerciseTaskKind === "SENTENCE_PRODUCTION",
  );
  if (!exercise) {
    throw new Error(
      `RICH_TARGET_MATERIAL_STIMULUS_EXERCISE_MISSING:${target.selector.key}`,
    );
  }
  const stimulusId = stableId(
    "stimulus",
    "pedagogicalMaterial",
    materialRevisionId,
  );
  const stimulusRevisionId = stableId("stimulusRevision", stimulusId, "v1");
  if (
    !artifact.learning.assessmentStimuli.some(
      (stimulus) => stimulus.id === stimulusId,
    )
  ) {
    artifact.learning.assessmentStimuli.push({
      id: stimulusId,
      stimulusKey: `material:${materialRevisionId}`,
    });
    artifact.learning.stimulusRevisions.push({
      id: stimulusRevisionId,
      stimulusId,
      contentHash: contentHash({ materialRevisionId }),
      provenanceId,
    });
    artifact.learning.stimulusBlocks.push({
      id: stableId("stimulusBlock", stimulusRevisionId, "1"),
      stimulusRevisionId,
      blockKind: "MATERIAL",
      position: 1,
      pedagogicalMaterialRevisionId: materialRevisionId,
    });
  }
  if (
    !artifact.learning.exerciseStimulusRefs.some(
      (reference) =>
        reference.exerciseRevisionId === exercise.id &&
        reference.stimulusRevisionId === stimulusRevisionId,
    )
  ) {
    artifact.learning.exerciseStimulusRefs.push({
      exerciseRevisionId: exercise.id,
      stimulusRevisionId,
      role: "CONTEXT",
      displayOrder:
        artifact.learning.exerciseStimulusRefs.filter(
          (reference) => reference.exerciseRevisionId === exercise.id,
        ).length + 1,
    });
  }
}

async function generateMaterials(
  artifact: SylisLexiconArtifactV1,
  manifest: SourceManifest,
  target: ResolvedRichTarget,
  executor: StructuredTaskExecutor,
): Promise<number> {
  let generatedCount = 0;
  for (const kind of [...target.selector.materialKinds].sort()) {
    const generation =
      await executor.execute<PedagogicalMaterialGenerationCandidate>({
        taskType: "PEDAGOGICAL_MATERIAL_GENERATION",
        schemaName: "sylis_pedagogical_material_generation",
        schema: pedagogicalMaterialGenerationCandidateSchema,
        systemPrompt:
          "Generate typed blocks for exactly one requested material kind and one supplied Sense. A mnemonic is a clearly invented memory aid and must never claim etymology. A micro-story needs one short English STORY containing a supplied form and one faithful zh-CN TRANSLATION. Return no Markdown or citations.",
        input: { ...lexicalEvidence(target), materialKind: kind },
        maxTokens: 900,
        semanticValidator: (candidate) =>
          validateMaterial(candidate, kind, target),
      });
    const verification = await executor.execute<CandidateVerification>({
      taskType: "PEDAGOGICAL_MATERIAL_VERIFICATION",
      schemaName: "sylis_pedagogical_material_verification",
      schema: candidateVerificationSchema,
      systemPrompt:
        "Independently verify that the candidate stays within the supplied Sense, preserves bilingual meaning, contains the required target mention, makes no false source or etymology claim, and is safe for adult learners. Return a typed verdict and stable reason codes.",
      input: {
        evidence: lexicalEvidence(target),
        candidate: generation.result.value,
      },
      maxTokens: 300,
    });
    if (verification.result.value.verdict !== "APPROVED") {
      throw new Error(
        `AI_MATERIAL_REJECTED:${target.selector.key}:${kind}:${verification.result.value.reasonCodes.join(",")}`,
      );
    }

    const provenanceId = ensureGeneratedProvenance(
      artifact,
      generation.candidateKey,
      {
        generation: generation.result.value,
        verification: verification.result.value,
      },
      upstreamProvenance(target),
      `${kind} candidate passed local and independent AI verification.`,
    );
    const materialId = stableId(
      "pedagogicalMaterial",
      target.selector.key,
      kind,
    );
    const revisionId = stableId(
      "pedagogicalMaterialRevision",
      materialId,
      generation.candidateKey,
    );
    artifact.learning.pedagogicalMaterials.push({
      id: materialId,
      materialKey: `rich:${target.selector.key}:${kind.toLocaleLowerCase()}`,
    });
    artifact.learning.pedagogicalMaterialRevisions.push({
      id: revisionId,
      materialId,
      materialKind: kind,
      learningLanguageTag: manifest.pedagogy?.learningLanguageTag ?? "en",
      supportLanguageTag: manifest.pedagogy?.supportLanguageTag ?? "zh-CN",
      audienceProfileKey:
        manifest.pedagogy?.audienceProfileKey ?? "zh-general-adult-en-v1",
      contentHash: contentHash(generation.result.value),
      provenanceId,
    });
    artifact.learning.pedagogicalMaterialTargets.push({
      materialRevisionId: revisionId,
      targetRole: "PRIMARY",
      target: { targetKind: "SENSE", targetId: target.sense.senseId },
    });
    for (const [index, block] of generation.result.value.blocks.entries()) {
      const blockId = stableId(
        "pedagogicalMaterialBlock",
        revisionId,
        String(index + 1),
      );
      artifact.learning.pedagogicalMaterialBlocks.push({
        id: blockId,
        materialRevisionId: revisionId,
        blockKind: "TEXT",
        blockRole: block.role,
        position: index + 1,
        languageTag: block.languageTag,
        text: block.text,
      });
      if (block.role === "STORY") {
        const mention = findMention(block.text, target.forms);
        if (mention) {
          artifact.learning.pedagogicalMaterialMentions.push({
            id: stableId(
              "pedagogicalMaterialMention",
              blockId,
              target.sense.senseId,
            ),
            materialBlockId: blockId,
            ...mention,
            target: { targetKind: "SENSE", targetId: target.sense.senseId },
          });
        }
      }
    }
    if (kind === "MICRO_STORY") {
      attachMaterialStimulus(artifact, target, revisionId, provenanceId);
    }
    generatedCount += 1;
  }
  return generatedCount;
}

async function generateHint(
  artifact: SylisLexiconArtifactV1,
  target: ResolvedRichTarget,
  executor: StructuredTaskExecutor,
): Promise<number> {
  if (!target.selector.generateStudyHint) return 0;
  const objective = matchingObjective(artifact, target.sense.senseId);
  if (!objective)
    throw new Error(`RICH_TARGET_OBJECTIVE_MISSING:${target.selector.key}`);
  if (
    artifact.learning.objectiveHints.some(
      (hint) => hint.learningObjectiveRevisionId === objective.id,
    )
  ) {
    return 0;
  }
  const execution = await executor.execute<StudyHintCandidate>({
    taskType: "STUDY_HINT",
    schemaName: "sylis_study_hint",
    schema: studyHintCandidateSchema,
    systemPrompt:
      "Generate one short zh-CN retrieval hint for the supplied learning Objective and exact Sense. It may cue the learner but must not reveal the complete answer. Return null when no non-revealing hint is possible.",
    input: { ...lexicalEvidence(target), objective },
    maxTokens: 180,
    semanticValidator: (candidate) => {
      const answer = target.translations[0]?.text;
      return candidate.hint &&
        answer &&
        normalizeComparableText(candidate.hint.text).includes(
          normalizeComparableText(answer),
        )
        ? "HINT_REVEALS_ANSWER"
        : null;
    },
  });
  if (!execution.result.value.hint) return 0;
  const provenanceId = ensureGeneratedProvenance(
    artifact,
    execution.candidateKey,
    execution.result.value,
    [...upstreamProvenance(target), objective.provenanceId],
    "Generated study hint passed non-revelation validation.",
  );
  artifact.learning.objectiveHints.push({
    id: stableId("learningObjectiveHint", objective.id, execution.candidateKey),
    learningObjectiveRevisionId: objective.id,
    hintType: "GENERATED_RETRIEVAL_CUE",
    languageTag: execution.result.value.hint.languageTag,
    text: execution.result.value.hint.text,
    displayOrder: 1,
    provenanceId,
  });
  return 1;
}

function exerciseForObjective(
  artifact: SylisLexiconArtifactV1,
  objectiveRevisionId: string,
) {
  return artifact.learning.exerciseRevisions.find(
    (exercise) =>
      exercise.learningObjectiveRevisionId === objectiveRevisionId &&
      exercise.exerciseTaskKind === "FORM_MEANING_MAPPING" &&
      exercise.responseKind === "CHOICE",
  );
}

function exerciseCandidateIsValid(
  candidate: ExerciseGenerationCandidate,
  correctAnswer: string,
  distractorPool: Set<string>,
): string | null {
  if (
    normalizeComparableText(candidate.correctResponse) !==
    normalizeComparableText(correctAnswer)
  ) {
    return "CORRECT_RESPONSE_NOT_SOURCE_BACKED";
  }
  const localIds = new Set(candidate.choices.map((choice) => choice.localId));
  const normalizedChoices = new Set(
    candidate.choices.map((choice) => normalizeComparableText(choice.text)),
  );
  if (
    localIds.size !== candidate.choices.length ||
    normalizedChoices.size !== candidate.choices.length
  ) {
    return "CHOICES_NOT_DISTINCT";
  }
  const correct = candidate.choices.filter((choice) => choice.correct);
  if (
    correct.length !== 1 ||
    normalizeComparableText(correct[0].text) !==
      normalizeComparableText(correctAnswer)
  ) {
    return "CORRECT_CHOICE_CARDINALITY";
  }
  for (const choice of candidate.choices.filter((value) => !value.correct)) {
    if (!distractorPool.has(normalizeComparableText(choice.text))) {
      return "DISTRACTOR_NOT_IN_SOURCE_POOL";
    }
  }
  return null;
}

async function verifyOrGenerateExercise(
  artifact: SylisLexiconArtifactV1,
  target: ResolvedRichTarget,
  executor: StructuredTaskExecutor,
): Promise<number> {
  if (!target.selector.generateExercise) return 0;
  const objective = matchingObjective(artifact, target.sense.senseId);
  if (!objective)
    throw new Error(`RICH_TARGET_OBJECTIVE_MISSING:${target.selector.key}`);
  const existing = exerciseForObjective(artifact, objective.id);
  if (existing) {
    const verification = await executor.execute<CandidateVerification>({
      taskType: "EXERCISE_VERIFICATION",
      schemaName: "sylis_exercise_verification",
      schema: candidateVerificationSchema,
      systemPrompt:
        "Independently verify answerability, unique correctness, distractor plausibility and diversity, target alignment, and absence of answer leakage. Return a typed verdict with stable reason codes.",
      input: {
        evidence: lexicalEvidence(target),
        exercise: existing,
        choices: artifact.learning.exerciseChoices.filter(
          (choice) => choice.exerciseRevisionId === existing.id,
        ),
        correctResponses: artifact.learning.correctResponses.filter(
          (response) => response.exerciseRevisionId === existing.id,
        ),
      },
      maxTokens: 350,
    });
    if (verification.result.value.verdict !== "APPROVED") {
      throw new Error(
        `AI_EXERCISE_REJECTED:${target.selector.key}:${verification.result.value.reasonCodes.join(",")}`,
      );
    }
    return 0;
  }

  const correctAnswer = target.translations[0]?.text;
  if (!correctAnswer) return 0;
  const distractorPool = new Map<string, string>();
  for (const translation of artifact.lexicon.translationTexts) {
    const normalized = normalizeComparableText(translation.text);
    if (
      translation.languageTag === "zh-CN" &&
      normalized !== normalizeComparableText(correctAnswer)
    ) {
      distractorPool.set(normalized, translation.text);
    }
  }
  if (distractorPool.size < 3) return 0;
  const generation = await executor.execute<ExerciseGenerationCandidate>({
    taskType: "EXERCISE_GENERATION",
    schemaName: "sylis_exercise_generation",
    schema: exerciseGenerationCandidateSchema,
    systemPrompt:
      "Generate one typed single-choice FORM_MEANING_MAPPING exercise. The supplied correct answer is immutable. Every incorrect choice must be copied exactly from the supplied source-backed distractor pool. Return stable candidate-local choice IDs, rationales, and concise feedback.",
    input: {
      evidence: lexicalEvidence(target),
      objective,
      correctAnswer,
      distractorPool: [...distractorPool.values()].slice(0, 40),
    },
    maxTokens: 1_100,
    semanticValidator: (candidate) =>
      exerciseCandidateIsValid(
        candidate,
        correctAnswer,
        new Set(distractorPool.keys()),
      ),
  });
  const verification = await executor.execute<CandidateVerification>({
    taskType: "EXERCISE_VERIFICATION",
    schemaName: "sylis_exercise_verification",
    schema: candidateVerificationSchema,
    systemPrompt:
      "Independently verify answerability, unique correctness, distractor plausibility and diversity, target alignment, and absence of answer leakage. Return a typed verdict with stable reason codes.",
    input: {
      evidence: lexicalEvidence(target),
      candidate: generation.result.value,
    },
    maxTokens: 350,
  });
  if (verification.result.value.verdict !== "APPROVED") {
    throw new Error(
      `AI_EXERCISE_REJECTED:${target.selector.key}:${verification.result.value.reasonCodes.join(",")}`,
    );
  }

  const objectiveIdentity = artifact.learning.learningObjectives.find(
    (candidate) => candidate.id === objective.objectiveId,
  );
  if (!objectiveIdentity)
    throw new Error("Exercise objective identity missing.");
  const provenanceId = ensureGeneratedProvenance(
    artifact,
    generation.candidateKey,
    {
      generation: generation.result.value,
      verification: verification.result.value,
    },
    [...upstreamProvenance(target), objective.provenanceId],
    "Generated exercise passed source-pool, task-matrix and independent verification.",
  );
  const itemId = stableId(
    "exerciseItem",
    objective.id,
    generation.candidateKey,
  );
  const revisionId = stableId(
    "exerciseRevision",
    itemId,
    generation.candidateKey,
  );
  artifact.learning.exerciseItems.push({
    id: itemId,
    exerciseKey: `ai:${target.selector.key}:form-meaning`,
    learningObjectiveId: objective.objectiveId,
  });
  artifact.learning.exerciseRevisions.push({
    id: revisionId,
    exerciseItemId: itemId,
    learningObjectiveRevisionId: objective.id,
    exerciseTaskKind: "FORM_MEANING_MAPPING",
    evidenceKind: "RECOGNITION",
    responseKind: "CHOICE",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
    prompt: { languageTag: "zh-CN", text: generation.result.value.prompt },
    instructions: null,
    shuffleChoices: true,
    maxScore: 1,
    authoredDifficultyTier: generation.result.value.authoredDifficultyTier,
    templateVersion: "ai-form-meaning/v1",
    generatorVersion: "structured-ai/v1",
    verifierVersion: "local+structured-ai/v1",
    contentHash: contentHash(generation.result.value),
    provenanceId,
  });
  artifact.learning.exerciseResponseConfigs.push({
    exerciseRevisionId: revisionId,
    responseKind: "CHOICE",
    minSelections: 1,
    maxSelections: 1,
  });
  let correctChoiceId: string | null = null;
  for (const [index, choice] of generation.result.value.choices.entries()) {
    const choiceId = stableId("exerciseChoice", revisionId, choice.localId);
    artifact.learning.exerciseChoices.push({
      id: choiceId,
      exerciseRevisionId: revisionId,
      choiceKey: choice.localId,
      languageTag: "zh-CN",
      text: choice.text,
      displayOrder: index + 1,
      distractorKind: choice.distractorKind,
    });
    if (choice.correct) correctChoiceId = choiceId;
  }
  if (!correctChoiceId)
    throw new Error("Generated exercise lost its correct choice.");
  artifact.learning.correctResponses.push({
    responseKind: "CHOICE",
    exerciseRevisionId: revisionId,
    choiceId: correctChoiceId,
    weight: 1,
  });
  for (const [index, feedback] of [
    {
      outcome: "CORRECT" as const,
      text: generation.result.value.feedbackCorrect,
    },
    {
      outcome: "INCORRECT" as const,
      text: generation.result.value.feedbackIncorrect,
    },
  ].entries()) {
    artifact.learning.exerciseFeedback.push({
      id: stableId("exerciseFeedback", revisionId, feedback.outcome),
      exerciseRevisionId: revisionId,
      outcome: feedback.outcome,
      choiceId: null,
      languageTag: "zh-CN",
      text: feedback.text,
      displayOrder: index + 1,
    });
  }
  return 1;
}

export async function enrichLearningContent(
  artifact: SylisLexiconArtifactV1,
  manifest: SourceManifest,
  targetSet: RichTargetSet,
  executor: StructuredTaskExecutor,
  progress: CompileProgressPort,
): Promise<void> {
  const targets = resolveRichTargets(artifact, targetSet);
  let processed = 0;
  const total = targets.length;
  for (const target of targets) {
    await generateMaterials(artifact, manifest, target, executor);
    await generateHint(artifact, target, executor);
    await verifyOrGenerateExercise(artifact, target, executor);
    processed += 1;
    await progress.report({
      stage: "PEDAGOGICAL_MATERIALS",
      processed,
      total,
      aiCostMicros: executor.spentMicros,
      message: target.selector.key,
    });
  }
}
