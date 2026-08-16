import type {
  ExerciseRevision,
  LearningObjectiveTarget,
  SylisLexiconArtifactV1,
} from "@sylis/lexicon-artifact";
import { createHash } from "node:crypto";

import type {
  CandidateExercise,
  CandidateSense,
  NormalizedSourceRecord,
} from "../candidates/candidate-v1";
import { normalizeComparableText } from "../normalize/text-profile";
import { stableId } from "../sources/source-context";

type Objective = {
  objectiveId: string;
  revisionId: string;
  facet: string;
  direction: "RECEPTIVE" | "PRODUCTIVE" | "BIDIRECTIONAL";
  target: LearningObjectiveTarget;
  provenanceId: string;
};

function hash(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function textForEntry(
  artifact: SylisLexiconArtifactV1,
  entryId: string,
): string {
  const entry = artifact.lexicon.entryRevisions.find(
    (candidate) => candidate.entryId === entryId,
  );
  return (
    artifact.lexicon.headwordRevisions.find(
      (headword) => headword.headwordId === entry?.headwordId,
    )?.displayText ?? entryId
  );
}

function formText(
  artifact: SylisLexiconArtifactV1,
  formId: string,
): string | undefined {
  return artifact.lexicon.formRepresentations.find(
    (representation) =>
      representation.formId === formId &&
      representation.representationType === "WRITTEN",
  )?.text;
}

function addObjective(
  artifact: SylisLexiconArtifactV1,
  facet: string,
  direction: Objective["direction"],
  target: LearningObjectiveTarget,
  provenanceId: string,
): Objective {
  const objectiveKey = `${facet.toLowerCase()}:${direction.toLowerCase()}:${target.targetKind.toLowerCase()}:${target.targetId}`;
  const objectiveId = stableId("objective", objectiveKey);
  const revisionId = stableId("objectiveRevision", objectiveId, "v1");
  if (
    !artifact.learning.learningObjectives.some(
      (value) => value.id === objectiveId,
    )
  ) {
    artifact.learning.learningObjectives.push({
      id: objectiveId,
      objectiveKey,
    });
    artifact.learning.objectiveRevisions.push({
      id: revisionId,
      objectiveId,
      knowledgeFacet: facet,
      retrievalDirection: direction,
      contentHash: hash({ facet, direction, target }),
      provenanceId,
    });
    artifact.learning.objectiveSubjects.push({
      learningObjectiveRevisionId: revisionId,
      subjectRole: "PRIMARY",
      target,
    });
  }
  return { objectiveId, revisionId, facet, direction, target, provenanceId };
}

function addLearnerExplanation(
  artifact: SylisLexiconArtifactV1,
  senseId: string,
  provenanceId: string,
): void {
  const definitions = artifact.lexicon.definitions.filter(
    (definition) => definition.senseId === senseId,
  );
  const translations = artifact.lexicon.translationTexts.filter(
    (translation) => translation.senseId === senseId,
  );
  if (definitions.length === 0 && translations.length === 0) return;
  const materialKey = `learner-explanation:${senseId}`;
  const materialId = stableId("material", materialKey);
  const revisionId = stableId("materialRevision", materialId, "v1");
  artifact.learning.pedagogicalMaterials.push({ id: materialId, materialKey });
  artifact.learning.pedagogicalMaterialRevisions.push({
    id: revisionId,
    materialId,
    materialKind: "LEARNER_EXPLANATION",
    learningLanguageTag: artifact.manifest.sourceLanguageTag,
    supportLanguageTag: artifact.manifest.learningLanguageTags[0],
    audienceProfileKey: "general-adult-learner-v1",
    contentHash: hash({ definitions, translations }),
    provenanceId,
  });
  artifact.learning.pedagogicalMaterialTargets.push({
    materialRevisionId: revisionId,
    targetRole: "PRIMARY",
    target: { targetKind: "SENSE", targetId: senseId },
  });
  let position = 1;
  for (const definition of definitions) {
    artifact.learning.pedagogicalMaterialBlocks.push({
      id: stableId("materialBlock", revisionId, String(position)),
      materialRevisionId: revisionId,
      blockKind: "TEXT",
      blockRole: "EXPLANATION",
      position: position++,
      languageTag: definition.languageTag,
      text: definition.text,
    });
  }
  for (const translation of translations) {
    artifact.learning.pedagogicalMaterialBlocks.push({
      id: stableId("materialBlock", revisionId, String(position)),
      materialRevisionId: revisionId,
      blockKind: "TEXT",
      blockRole: "TRANSLATION",
      position: position++,
      languageTag: translation.languageTag,
      text: translation.text,
    });
  }
  const example = artifact.lexicon.senseExamples.find(
    (candidate) => candidate.senseId === senseId,
  );
  if (example) {
    artifact.learning.pedagogicalMaterialBlocks.push({
      id: stableId("materialBlock", revisionId, String(position)),
      materialRevisionId: revisionId,
      blockKind: "EXAMPLE",
      blockRole: "EXAMPLE",
      position,
      senseExampleId: example.id,
    });
  }
}

function addExampleStimulus(
  artifact: SylisLexiconArtifactV1,
  senseExampleId: string,
  provenanceId: string,
): string {
  const stimulusId = stableId("stimulus", "senseExample", senseExampleId);
  const revisionId = stableId("stimulusRevision", stimulusId, "v1");
  if (
    !artifact.learning.assessmentStimuli.some(
      (value) => value.id === stimulusId,
    )
  ) {
    artifact.learning.assessmentStimuli.push({
      id: stimulusId,
      stimulusKey: `sense-example:${senseExampleId}`,
    });
    artifact.learning.stimulusRevisions.push({
      id: revisionId,
      stimulusId,
      contentHash: hash({ senseExampleId }),
      provenanceId,
    });
    artifact.learning.stimulusBlocks.push({
      id: stableId("stimulusBlock", revisionId, "1"),
      stimulusRevisionId: revisionId,
      blockKind: "EXAMPLE",
      position: 1,
      senseExampleId,
    });
  }
  return revisionId;
}

function addTextStimulus(
  artifact: SylisLexiconArtifactV1,
  key: string,
  text: string,
  languageTag: string,
  provenanceId: string,
): string {
  const stimulusId = stableId("stimulus", key);
  const revisionId = stableId("stimulusRevision", stimulusId, "v1");
  if (
    !artifact.learning.assessmentStimuli.some(
      (value) => value.id === stimulusId,
    )
  ) {
    artifact.learning.assessmentStimuli.push({
      id: stimulusId,
      stimulusKey: key,
    });
    artifact.learning.stimulusRevisions.push({
      id: revisionId,
      stimulusId,
      contentHash: hash({ text, languageTag }),
      provenanceId,
    });
    artifact.learning.stimulusBlocks.push({
      id: stableId("stimulusBlock", revisionId, "1"),
      stimulusRevisionId: revisionId,
      blockKind: "TEXT",
      position: 1,
      languageTag,
      text,
    });
  }
  return revisionId;
}

function baseExercise(
  artifact: SylisLexiconArtifactV1,
  objective: Objective,
  task: string,
  profile: Pick<
    ExerciseRevision,
    | "evidenceKind"
    | "responseKind"
    | "responseCardinality"
    | "responsePlacement"
    | "gradingMode"
    | "validationLevel"
  >,
  prompt: string,
): ExerciseRevision | null {
  const exerciseKey = `${task.toLowerCase()}:${objective.revisionId}`;
  const itemId = stableId("exercise", exerciseKey);
  const revisionId = stableId("exerciseRevision", itemId, "v1");
  if (
    artifact.learning.exerciseRevisions.some(
      (revision) => revision.id === revisionId,
    )
  ) {
    return null;
  }
  artifact.learning.exerciseItems.push({
    id: itemId,
    exerciseKey,
    learningObjectiveId: objective.objectiveId,
  });
  const revision: ExerciseRevision = {
    id: revisionId,
    exerciseItemId: itemId,
    learningObjectiveRevisionId: objective.revisionId,
    exerciseTaskKind: task,
    ...profile,
    prompt: { languageTag: "en", text: prompt },
    instructions: null,
    shuffleChoices: profile.responseKind === "CHOICE",
    maxScore: 1,
    authoredDifficultyTier: "FOUNDATION",
    templateVersion: "deterministic-learning-content/v1",
    generatorVersion: "lexicon-compiler/v1",
    verifierVersion: "exercise-contract/v1",
    contentHash: hash({ exerciseKey, profile, prompt }),
    provenanceId: objective.provenanceId,
  };
  artifact.learning.exerciseRevisions.push(revision);
  return revision;
}

function addShortTextExercise(
  artifact: SylisLexiconArtifactV1,
  objective: Objective,
  task: string,
  evidenceKind: ExerciseRevision["evidenceKind"],
  prompt: string,
  accepted: Array<{ languageTag: string; text: string }>,
  placement: "BLOCK" | "INLINE" = "BLOCK",
  stimulusRevisionId?: string,
  gradingMode: "EXACT" | "SELF_REPORT" = "EXACT",
): void {
  if (accepted.length === 0) return;
  const revision = baseExercise(
    artifact,
    objective,
    task,
    {
      evidenceKind,
      responseKind: "SHORT_TEXT",
      responseCardinality: "SINGLE",
      responsePlacement: placement,
      gradingMode,
      validationLevel:
        gradingMode === "SELF_REPORT" ? "PRACTICE_ONLY" : "FORMATIVE_VERIFIED",
    },
    prompt,
  );
  if (!revision) return;
  artifact.learning.exerciseResponseConfigs.push({
    exerciseRevisionId: revision.id,
    responseKind: "SHORT_TEXT",
    caseSensitive: false,
    diacriticPolicy: "PRESERVE",
    whitespacePolicy: "COLLAPSE",
    capturePolicy: gradingMode === "SELF_REPORT" ? "OPTIONAL" : "REQUIRED",
  });
  const seen = new Set<string>();
  for (const value of accepted) {
    const key = `${value.languageTag}:${normalizeComparableText(value.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    artifact.learning.correctResponses.push({
      responseKind: "ACCEPTED_TEXT",
      exerciseRevisionId: revision.id,
      languageTag: value.languageTag,
      text: value.text,
      weight: 1,
    });
  }
  if (stimulusRevisionId) {
    artifact.learning.exerciseStimulusRefs.push({
      exerciseRevisionId: revision.id,
      stimulusRevisionId,
      role: "CONTEXT",
      displayOrder: 1,
    });
  }
  if (gradingMode === "SELF_REPORT" && accepted.length > 0) {
    const reference = accepted
      .map(({ languageTag, text }) => `[${languageTag}] ${text}`)
      .join("\n");
    const revealRevisionId = addTextStimulus(
      artifact,
      `short-text-reveal:${revision.id}`,
      reference,
      accepted[0]!.languageTag,
      objective.provenanceId,
    );
    artifact.learning.exerciseStimulusRefs.push({
      exerciseRevisionId: revision.id,
      stimulusRevisionId: revealRevisionId,
      role: "REVEAL",
      displayOrder: stimulusRevisionId ? 2 : 1,
    });
  }
}

function addChoiceExercise(
  artifact: SylisLexiconArtifactV1,
  objective: Objective,
  task: string,
  evidenceKind: ExerciseRevision["evidenceKind"],
  prompt: string,
  choices: Array<{
    languageTag: string;
    text: string;
    correct: boolean;
  }>,
  multiple = false,
): void {
  const distinct = new Map<string, (typeof choices)[number]>();
  for (const choice of choices) {
    const key = `${choice.languageTag}:${normalizeComparableText(choice.text)}`;
    const previous = distinct.get(key);
    if (!previous || choice.correct) distinct.set(key, choice);
  }
  const values = [...distinct.values()];
  if (values.length < 2 || !values.some((choice) => choice.correct)) return;
  const revision = baseExercise(
    artifact,
    objective,
    task,
    {
      evidenceKind,
      responseKind: "CHOICE",
      responseCardinality: multiple ? "MULTIPLE" : "SINGLE",
      responsePlacement: "BLOCK",
      gradingMode: multiple ? "WEIGHTED" : "EXACT",
      validationLevel: "FORMATIVE_VERIFIED",
    },
    prompt,
  );
  if (!revision) return;
  artifact.learning.exerciseResponseConfigs.push({
    exerciseRevisionId: revision.id,
    responseKind: "CHOICE",
    minSelections: 1,
    maxSelections: multiple
      ? values.filter((choice) => choice.correct).length
      : 1,
  });
  for (const [index, choice] of values.entries()) {
    const choiceId = stableId("exerciseChoice", revision.id, choice.text);
    artifact.learning.exerciseChoices.push({
      id: choiceId,
      exerciseRevisionId: revision.id,
      choiceKey: `choice-${index + 1}`,
      languageTag: choice.languageTag,
      text: choice.text,
      displayOrder: index + 1,
      distractorKind: choice.correct ? null : "PLAUSIBLE_SAME_DOMAIN",
    });
    if (choice.correct) {
      artifact.learning.correctResponses.push({
        responseKind: "CHOICE",
        exerciseRevisionId: revision.id,
        choiceId,
        weight: multiple
          ? 1 / values.filter((value) => value.correct).length
          : 1,
      });
    }
  }
}

function addMorphologyWalkthrough(
  artifact: SylisLexiconArtifactV1,
  wordFormationId: string,
  provenanceId: string,
): void {
  const formation = artifact.lexicon.morphology.wordFormations.find(
    (candidate) => candidate.id === wordFormationId,
  );
  if (!formation) return;
  const entryText = textForEntry(artifact, formation.targetEntryId);
  const inputs = artifact.lexicon.morphology.wordFormationInputs
    .filter((input) => input.wordFormationId === wordFormationId)
    .sort((left, right) => left.position - right.position)
    .map((input) => {
      const morpheme = artifact.lexicon.morphology.morphemes.find(
        (candidate) => candidate.id === input.target.targetId,
      );
      return morpheme?.identityKey.split(":").at(-1) ?? input.target.targetId;
    });
  if (inputs.length === 0) return;
  const materialKey = `morphology-walkthrough:${wordFormationId}`;
  const materialId = stableId("material", materialKey);
  const revisionId = stableId("materialRevision", materialId, "v1");
  const text = `${inputs.join(" + ")} -> ${entryText}`;
  artifact.learning.pedagogicalMaterials.push({ id: materialId, materialKey });
  artifact.learning.pedagogicalMaterialRevisions.push({
    id: revisionId,
    materialId,
    materialKind: "MORPHOLOGY_WALKTHROUGH",
    learningLanguageTag: artifact.manifest.sourceLanguageTag,
    supportLanguageTag: artifact.manifest.learningLanguageTags[0],
    audienceProfileKey: "general-adult-learner-v1",
    contentHash: hash(text),
    provenanceId,
  });
  artifact.learning.pedagogicalMaterialTargets.push({
    materialRevisionId: revisionId,
    targetRole: "PRIMARY",
    target: { targetKind: "WORD_FORMATION", targetId: wordFormationId },
  });
  artifact.learning.pedagogicalMaterialBlocks.push({
    id: stableId("materialBlock", revisionId, "1"),
    materialRevisionId: revisionId,
    blockKind: "TEXT",
    blockRole: "EXPLANATION",
    position: 1,
    languageTag: artifact.manifest.sourceLanguageTag,
    text,
  });
}

function addSpokenProduction(
  artifact: SylisLexiconArtifactV1,
  objective: Objective,
  written: string,
  phonetic: string,
): void {
  const reveal = addTextStimulus(
    artifact,
    `spoken-reveal:${objective.target.targetId}`,
    phonetic,
    artifact.manifest.sourceLanguageTag,
    objective.provenanceId,
  );
  const revision = baseExercise(
    artifact,
    objective,
    "SPOKEN_FORM_PRODUCTION",
    {
      evidenceKind: "CONSTRAINED_PRODUCTION",
      responseKind: "NO_CAPTURE",
      responseCardinality: "SINGLE",
      responsePlacement: "BLOCK",
      gradingMode: "SELF_REPORT",
      validationLevel: "PRACTICE_ONLY",
    },
    `Pronounce “${written}”, then reveal the reference pronunciation.`,
  );
  if (!revision) return;
  artifact.learning.exerciseResponseConfigs.push({
    exerciseRevisionId: revision.id,
    responseKind: "NO_CAPTURE",
  });
  artifact.learning.exerciseStimulusRefs.push({
    exerciseRevisionId: revision.id,
    stimulusRevisionId: reveal,
    role: "REVEAL",
    displayOrder: 1,
  });
}

function addSentenceExercise(
  artifact: SylisLexiconArtifactV1,
  objective: Objective,
  task: "SENTENCE_TRANSLATION" | "SENTENCE_PRODUCTION",
  prompt: string,
  stimulusRevisionId?: string,
): void {
  const revision = baseExercise(
    artifact,
    objective,
    task,
    {
      evidenceKind: "FREE_PRODUCTION",
      responseKind: "EXTENDED_TEXT",
      responseCardinality: "SINGLE",
      responsePlacement: "BLOCK",
      gradingMode: "SELF_REPORT",
      validationLevel: "PRACTICE_ONLY",
    },
    prompt,
  );
  if (!revision) return;
  artifact.learning.exerciseResponseConfigs.push({
    exerciseRevisionId: revision.id,
    responseKind: "EXTENDED_TEXT",
    expectedLanguageTag: artifact.manifest.sourceLanguageTag,
    minCharacters: 3,
    maxCharacters: 500,
    minWords: 1,
    maxWords: 80,
    capturePolicy: "OPTIONAL",
  });
  const rubricId = stableId("exerciseRubric", revision.id, "target-use");
  artifact.learning.exerciseRubrics.push({
    id: rubricId,
    exerciseRevisionId: revision.id,
    criterionKey: "target-use",
    languageTag: artifact.manifest.learningLanguageTags[0],
    description: "目标词应符合指定义项和语境。",
    maxScore: 1,
    displayOrder: 1,
  });
  artifact.learning.correctResponses.push({
    responseKind: "RUBRIC",
    exerciseRevisionId: revision.id,
    rubricCriterionId: rubricId,
    weight: 1,
  });
  if (stimulusRevisionId) {
    artifact.learning.exerciseStimulusRefs.push({
      exerciseRevisionId: revision.id,
      stimulusRevisionId,
      role: "CONTEXT",
      displayOrder: 1,
    });
  }
}

function resolvedSenseIdForSourceSense(
  artifact: SylisLexiconArtifactV1,
  record: NormalizedSourceRecord,
  sourceSense: CandidateSense,
): string | null {
  const headwordId = artifact.lexicon.headwords.find(
    (headword) =>
      headword.identityKey ===
      `${record.languageTag}:${record.normalizedHeadword}`,
  )?.id;
  if (!headwordId) return null;
  const entries = artifact.lexicon.entryRevisions.filter(
    (entry) =>
      entry.headwordId === headwordId &&
      entry.partOfSpeech === sourceSense.partOfSpeech,
  );
  if (entries.length !== 1) return null;
  const senses = artifact.lexicon.senseRevisions.filter(
    (sense) => sense.entryId === entries[0]!.entryId,
  );
  if (senses.length === 1) return senses[0]!.senseId;

  const sourceTexts = new Set(
    [...sourceSense.definitions, ...sourceSense.translations].map((value) =>
      normalizeComparableText(value.text),
    ),
  );
  const matching = senses.filter((sense) =>
    [
      ...artifact.lexicon.definitions.filter(
        (definition) => definition.senseId === sense.senseId,
      ),
      ...artifact.lexicon.translationTexts.filter(
        (translation) => translation.senseId === sense.senseId,
      ),
    ].some((value) => sourceTexts.has(normalizeComparableText(value.text))),
  );
  return matching.length === 1 ? matching[0]!.senseId : null;
}

function addSourceChoiceExercise(
  artifact: SylisLexiconArtifactV1,
  objective: Objective,
  senseId: string,
  exercise: CandidateExercise,
  provenanceId: string,
): void {
  const supportedAnswers = new Set(
    [
      ...artifact.lexicon.definitions.filter(
        (definition) => definition.senseId === senseId,
      ),
      ...artifact.lexicon.translationTexts.filter(
        (translation) => translation.senseId === senseId,
      ),
    ].map((value) => normalizeComparableText(value.text)),
  );
  const correctText = normalizeComparableText(exercise.correctResponse.text);
  const normalizedChoices = exercise.choices.map((choice) =>
    normalizeComparableText(choice.text),
  );
  if (
    !supportedAnswers.has(correctText) ||
    exercise.choices.length < 2 ||
    new Set(normalizedChoices).size !== exercise.choices.length ||
    normalizedChoices.filter((choice) => choice === correctText).length !== 1
  ) {
    return;
  }

  const exerciseKey = `source:${stableId(
    "sourceExercise",
    provenanceId,
    exercise.sourceExerciseKey,
  )}`;
  const itemId = stableId("exercise", exerciseKey);
  const revisionId = stableId("exerciseRevision", itemId, "v1");
  if (
    artifact.learning.exerciseRevisions.some(
      (revision) => revision.id === revisionId,
    )
  ) {
    return;
  }
  artifact.learning.exerciseItems.push({
    id: itemId,
    exerciseKey,
    learningObjectiveId: objective.objectiveId,
  });
  artifact.learning.exerciseRevisions.push({
    id: revisionId,
    exerciseItemId: itemId,
    learningObjectiveRevisionId: objective.revisionId,
    exerciseTaskKind: "FORM_MEANING_MAPPING",
    evidenceKind: "RECOGNITION",
    responseKind: "CHOICE",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
    prompt: exercise.prompt,
    instructions: null,
    shuffleChoices: true,
    maxScore: 1,
    authoredDifficultyTier: "FOUNDATION",
    templateVersion: "source-exercise/v1",
    generatorVersion: "youdao-adapter/v1",
    verifierVersion: "source-answer-contract/v1",
    contentHash: hash(exercise),
    provenanceId,
  });
  artifact.learning.exerciseResponseConfigs.push({
    exerciseRevisionId: revisionId,
    responseKind: "CHOICE",
    minSelections: 1,
    maxSelections: 1,
  });
  let correctChoiceId: string | null = null;
  for (const [index, choice] of exercise.choices.entries()) {
    const normalized = normalizeComparableText(choice.text);
    const choiceId = stableId("exerciseChoice", revisionId, normalized);
    artifact.learning.exerciseChoices.push({
      id: choiceId,
      exerciseRevisionId: revisionId,
      choiceKey: stableId("sourceChoice", normalized),
      languageTag: choice.languageTag,
      text: choice.text,
      displayOrder: index + 1,
      distractorKind: normalized === correctText ? null : "SOURCE_DISTRACTOR",
    });
    if (normalized === correctText) correctChoiceId = choiceId;
  }
  if (!correctChoiceId) return;
  artifact.learning.correctResponses.push({
    responseKind: "CHOICE",
    exerciseRevisionId: revisionId,
    choiceId: correctChoiceId,
    weight: 1,
  });
  if (exercise.explanation) {
    artifact.learning.exerciseFeedback.push({
      id: stableId("exerciseFeedback", revisionId, "source-explanation"),
      exerciseRevisionId: revisionId,
      outcome: "INCORRECT",
      choiceId: null,
      languageTag: exercise.explanation.languageTag,
      text: exercise.explanation.text,
      displayOrder: 1,
    });
  }
}

export function buildLearningContent(
  artifact: SylisLexiconArtifactV1,
  sourceRecords: readonly NormalizedSourceRecord[] = [],
): void {
  const objectives: Objective[] = [];
  for (const sense of artifact.lexicon.senseRevisions) {
    const definitions = artifact.lexicon.definitions.filter(
      (value) => value.senseId === sense.senseId,
    );
    const translations = artifact.lexicon.translationTexts.filter(
      (value) => value.senseId === sense.senseId,
    );
    const examples = artifact.lexicon.senseExamples.filter(
      (value) => value.senseId === sense.senseId,
    );
    if (definitions.length > 0 || translations.length > 0) {
      const objective = addObjective(
        artifact,
        "MEANING_FORM_MEANING",
        "RECEPTIVE",
        { targetKind: "SENSE", targetId: sense.senseId },
        sense.provenanceId,
      );
      objectives.push(objective);
      addShortTextExercise(
        artifact,
        objective,
        "FORM_MEANING_MAPPING",
        "CUED_RECALL",
        `Write one meaning of “${textForEntry(artifact, sense.entryId)}”.`,
        [...translations, ...definitions].map((value) => ({
          languageTag: value.languageTag,
          text: value.text,
        })),
      );
      const translatedExample = examples.find((binding) =>
        artifact.lexicon.exampleTranslations.some(
          (translation) => translation.exampleId === binding.exampleId,
        ),
      );
      if (translatedExample) {
        const stimulus = addExampleStimulus(
          artifact,
          translatedExample.id,
          sense.provenanceId,
        );
        addSentenceExercise(
          artifact,
          objective,
          "SENTENCE_TRANSLATION",
          `Translate the context using “${textForEntry(artifact, sense.entryId)}”.`,
          stimulus,
        );
      }
    }
    if (examples.length > 0) {
      const objective = addObjective(
        artifact,
        "MEANING_CONCEPT_REFERENT",
        "RECEPTIVE",
        { targetKind: "SENSE", targetId: sense.senseId },
        sense.provenanceId,
      );
      objectives.push(objective);
      const stimulus = addExampleStimulus(
        artifact,
        examples[0]!.id,
        sense.provenanceId,
      );
      addShortTextExercise(
        artifact,
        objective,
        "CONTEXTUAL_SENSE_INTERPRETATION",
        "CONTEXTUAL_DISCRIMINATION",
        "Explain the target word’s meaning in this context.",
        [...translations, ...definitions].map((value) => ({
          languageTag: value.languageTag,
          text: value.text,
        })),
        "BLOCK",
        stimulus,
        "SELF_REPORT",
      );
      addSentenceExercise(
        artifact,
        objective,
        "SENTENCE_PRODUCTION",
        `Write a new sentence using “${textForEntry(artifact, sense.entryId)}” with the same sense.`,
        stimulus,
      );

      const canonicalForm = artifact.lexicon.forms.find(
        (form) =>
          form.entryId === sense.entryId && form.formType === "CANONICAL",
      );
      const canonicalText = canonicalForm
        ? formText(artifact, canonicalForm.id)
        : undefined;
      if (canonicalForm && canonicalText) {
        const writtenObjective = addObjective(
          artifact,
          "FORM_WRITTEN",
          "PRODUCTIVE",
          { targetKind: "FORM", targetId: canonicalForm.id },
          sense.provenanceId,
        );
        objectives.push(writtenObjective);
        addShortTextExercise(
          artifact,
          writtenObjective,
          "CONTEXTUAL_FORM_COMPLETION",
          "CONSTRAINED_PRODUCTION",
          "Complete the target form in the supplied context.",
          [
            {
              languageTag: artifact.manifest.sourceLanguageTag,
              text: canonicalText,
            },
          ],
          "INLINE",
          stimulus,
        );
      }
    }
    addLearnerExplanation(artifact, sense.senseId, sense.provenanceId);
  }

  for (const record of sourceRecords) {
    for (const sourceSense of record.senses) {
      if (!sourceSense.exercises?.length) continue;
      const senseId = resolvedSenseIdForSourceSense(
        artifact,
        record,
        sourceSense,
      );
      if (!senseId) continue;
      const objective = objectives.find(
        (candidate) =>
          candidate.facet === "MEANING_FORM_MEANING" &&
          candidate.direction === "RECEPTIVE" &&
          candidate.target.targetKind === "SENSE" &&
          candidate.target.targetId === senseId,
      );
      if (!objective) continue;
      const provenanceId = stableId(
        "provenance",
        record.sourceRecordId,
        "direct",
      );
      for (const exercise of sourceSense.exercises) {
        addSourceChoiceExercise(
          artifact,
          objective,
          senseId,
          exercise,
          provenanceId,
        );
      }
    }
  }

  for (const form of artifact.lexicon.forms) {
    const written = formText(artifact, form.id);
    if (!written) continue;
    const phonetic = artifact.lexicon.formRepresentations.find(
      (representation) =>
        representation.formId === form.id &&
        representation.representationType === "PHONETIC",
    );
    if (phonetic) {
      const receptive = addObjective(
        artifact,
        "FORM_SPOKEN",
        "RECEPTIVE",
        { targetKind: "FORM", targetId: form.id },
        phonetic.provenanceId,
      );
      objectives.push(receptive);
      addShortTextExercise(
        artifact,
        receptive,
        "SPOKEN_FORM_MAPPING",
        "CUED_RECALL",
        `Write the word represented by ${phonetic.text}.`,
        [{ languageTag: phonetic.languageTag, text: written }],
      );
      const productive = addObjective(
        artifact,
        "FORM_SPOKEN",
        "PRODUCTIVE",
        { targetKind: "FORM", targetId: form.id },
        phonetic.provenanceId,
      );
      objectives.push(productive);
      addSpokenProduction(artifact, productive, written, phonetic.text);
    }
  }

  const headwordChoices = artifact.lexicon.entryRevisions.map((entry) => ({
    entryId: entry.entryId,
    text: textForEntry(artifact, entry.entryId),
  }));
  for (const relation of artifact.lexicon.senseRelations) {
    const sourceSense = artifact.lexicon.senseRevisions.find(
      (sense) => sense.senseId === relation.sourceId,
    );
    const targetSense = artifact.lexicon.senseRevisions.find(
      (sense) => sense.senseId === relation.targetId,
    );
    if (!sourceSense || !targetSense) continue;
    const objective = addObjective(
      artifact,
      "MEANING_ASSOCIATIONS",
      "RECEPTIVE",
      { targetKind: "SENSE", targetId: sourceSense.senseId },
      relation.provenanceId,
    );
    objectives.push(objective);
    const targetText = textForEntry(artifact, targetSense.entryId);
    addChoiceExercise(
      artifact,
      objective,
      "SEMANTIC_RELATION_DISCRIMINATION",
      "CONTEXTUAL_DISCRIMINATION",
      `Which word has the ${relation.relationType.toLocaleLowerCase()} relation?`,
      [
        {
          languageTag: artifact.manifest.sourceLanguageTag,
          text: targetText,
          correct: true,
        },
        ...headwordChoices
          .filter((choice) => choice.text !== targetText)
          .slice(0, 3)
          .map((choice) => ({
            languageTag: artifact.manifest.sourceLanguageTag,
            text: choice.text,
            correct: false,
          })),
      ],
    );
  }

  for (const binding of artifact.lexicon.senseCollocations) {
    const collocation = artifact.lexicon.collocations.find(
      (candidate) => candidate.id === binding.collocationId,
    );
    if (!collocation) continue;
    const objective = addObjective(
      artifact,
      "USE_COLLOCATION",
      "PRODUCTIVE",
      { targetKind: "COLLOCATION", targetId: collocation.id },
      binding.provenanceId,
    );
    objectives.push(objective);
    addShortTextExercise(
      artifact,
      objective,
      "COLLOCATION_RECALL",
      "CUED_RECALL",
      "Write the complete collocation.",
      [
        {
          languageTag: collocation.languageTag,
          text: collocation.canonicalText,
        },
      ],
    );
  }

  for (const senseFrame of artifact.lexicon.senseFrames) {
    const frame = artifact.lexicon.frames.find(
      (candidate) => candidate.id === senseFrame.frameId,
    );
    if (!frame) continue;
    const objective = addObjective(
      artifact,
      "USE_GRAMMATICAL_FUNCTION",
      "PRODUCTIVE",
      { targetKind: "FRAME", targetId: frame.id },
      senseFrame.provenanceId,
    );
    objectives.push(objective);
    const markers = artifact.lexicon.syntacticArguments
      .filter((argument) => argument.frameId === frame.id && argument.marker)
      .map((argument) => argument.marker!);
    addShortTextExercise(
      artifact,
      objective,
      "FRAME_COMPLETION",
      "CONSTRAINED_PRODUCTION",
      markers.length > 0
        ? frame.displayTemplate.replace(markers[0]!, "____")
        : "Write the complete grammatical frame.",
      (markers.length > 0 ? markers : [frame.displayTemplate]).map((text) => ({
        languageTag: frame.languageTag,
        text,
      })),
      "INLINE",
    );
  }

  for (const analysis of artifact.lexicon.morphology.analyses) {
    const representation = artifact.lexicon.formRepresentations.find(
      (candidate) => candidate.id === analysis.formRepresentationId,
    );
    if (!representation) continue;
    const segments = artifact.lexicon.morphology.segments
      .filter((segment) => segment.analysisId === analysis.id)
      .sort((left, right) => left.position - right.position);
    if (segments.length < 2) continue;
    const objective = addObjective(
      artifact,
      "FORM_WORD_PARTS",
      "BIDIRECTIONAL",
      { targetKind: "FORM", targetId: representation.formId },
      analysis.provenanceId,
    );
    objectives.push(objective);
    const correct = segments.map((segment) => segment.surfaceText).join(" + ");
    addChoiceExercise(
      artifact,
      objective,
      "MORPHEME_ANALYSIS",
      "RECOGNITION",
      `Which analysis correctly segments “${representation.text}”?`,
      [
        {
          languageTag: representation.languageTag,
          text: correct,
          correct: true,
        },
        {
          languageTag: representation.languageTag,
          text: representation.text,
          correct: false,
        },
        {
          languageTag: representation.languageTag,
          text: [...segments]
            .reverse()
            .map((segment) => segment.surfaceText)
            .join(" + "),
          correct: false,
        },
      ],
    );
    const formation = artifact.lexicon.morphology.wordFormations.find(
      (candidate) => {
        const form = artifact.lexicon.forms.find(
          (value) => value.id === representation.formId,
        );
        return candidate.targetEntryId === form?.entryId;
      },
    );
    if (formation) {
      addShortTextExercise(
        artifact,
        objective,
        "WORD_FORMATION",
        "CONSTRAINED_PRODUCTION",
        `Combine ${correct} into the derived word.`,
        [
          {
            languageTag: representation.languageTag,
            text: representation.text,
          },
        ],
      );
      addMorphologyWalkthrough(artifact, formation.id, formation.provenanceId);
    }
  }

  for (const usage of artifact.lexicon.usages) {
    const valueTerm = usage.valueTermId
      ? artifact.vocabularies.terms.find(
          (term) => term.id === usage.valueTermId,
        )
      : undefined;
    const correct = valueTerm?.label ?? usage.text;
    if (!correct) continue;
    const objective = addObjective(
      artifact,
      "USE_CONSTRAINTS",
      "RECEPTIVE",
      { targetKind: "SENSE", targetId: usage.senseId },
      usage.provenanceId,
    );
    objectives.push(objective);
    const alternatives = artifact.lexicon.usages
      .filter((candidate) => candidate.id !== usage.id)
      .map((candidate) =>
        candidate.valueTermId
          ? artifact.vocabularies.terms.find(
              (term) => term.id === candidate.valueTermId,
            )?.label
          : candidate.text,
      )
      .filter((value): value is string => Boolean(value));
    addChoiceExercise(
      artifact,
      objective,
      "USAGE_CONSTRAINT_DISCRIMINATION",
      "CONTEXTUAL_DISCRIMINATION",
      "Which usage constraint is source-backed for this sense?",
      [
        {
          languageTag: artifact.manifest.sourceLanguageTag,
          text: correct,
          correct: true,
        },
        ...alternatives.slice(0, 3).map((text) => ({
          languageTag: artifact.manifest.sourceLanguageTag,
          text,
          correct: false,
        })),
      ],
    );
  }

  const exerciseCount = artifact.learning.exerciseRevisions.length;
  if (exerciseCount > 0) {
    const blueprintId = stableId("blueprint", "default-practice-v1");
    const revisionId = stableId("blueprintRevision", blueprintId, "v1");
    const provenanceId = objectives[0]!.provenanceId;
    const sectionId = stableId("assessmentSection", revisionId, "all");
    artifact.learning.assessmentBlueprints.push({
      id: blueprintId,
      blueprintKey: "default-practice-v1",
      purpose: "PRACTICE",
    });
    artifact.learning.assessmentBlueprintRevisions.push({
      id: revisionId,
      blueprintId,
      version: "v1",
      title: "Default practice",
      navigationMode: "LINEAR",
      feedbackMode: "IMMEDIATE",
      timeLimitSeconds: null,
      lookbackDays: 7,
      contentHash: hash(
        artifact.learning.exerciseRevisions.map((revision) => revision.id),
      ),
      provenanceId,
    });
    artifact.learning.assessmentSections.push({
      id: sectionId,
      blueprintRevisionId: revisionId,
      parentSectionId: null,
      sectionKey: "all",
      title: "Practice",
      displayOrder: 1,
      questionCount: Math.min(20, exerciseCount),
    });
  }
  artifact.quality.exerciseStatistics = [
    { key: "objectives", count: artifact.learning.learningObjectives.length },
    { key: "exercises", count: artifact.learning.exerciseItems.length },
    ...[
      ...new Set(
        artifact.learning.exerciseRevisions.map(
          (value) => value.exerciseTaskKind,
        ),
      ),
    ]
      .sort()
      .map((task) => ({
        key: `task:${task}`,
        count: artifact.learning.exerciseRevisions.filter(
          (revision) => revision.exerciseTaskKind === task,
        ).length,
      })),
  ];
}
