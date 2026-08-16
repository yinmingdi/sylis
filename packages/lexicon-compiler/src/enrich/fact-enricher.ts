import type { SylisLexiconArtifactV1 } from "@sylis/lexicon-artifact";

import {
  ensureDerivedCandidateProvenance,
  recordCandidatePromotionLineage,
  sourceRecordIdsForProvenance,
} from "../candidates/candidate-provenance";
import { CandidateCollocationComponentRole } from "../candidates/candidate-v1";
import {
  executeLexicalCandidateTasks,
  type LexicalCandidatePort,
  LexicalCandidatePromotionEntityType,
  LexicalCandidateRiskClass,
  LexicalCandidateTargetKind,
  LexicalCandidateTaskType,
} from "../candidates/lexical-candidate";
import {
  normalizeComparableText,
  normalizeIdentityText,
} from "../normalize/text-profile";
import { CompileStage, type CompileProgressPort } from "../progress/reporter";
import { LexicalStructureBuilder } from "../resolve/lexical-structures";
import { stableId } from "../sources/source-context";
import {
  type CollocationEnrichmentCandidate,
  collocationEnrichmentCandidateSchema,
  type ExampleGenerationCandidate,
  exampleGenerationCandidateSchema,
  type SynsemFrameCandidate,
  synsemFrameCandidateSchema,
} from "./schemas/fact-enrichment";
import { StructuredTaskExecutor } from "./structured-task-executor";

interface SenseContext {
  sense: SylisLexiconArtifactV1["lexicon"]["senseRevisions"][number];
  entry: SylisLexiconArtifactV1["lexicon"]["entryRevisions"][number];
  headword: SylisLexiconArtifactV1["lexicon"]["headwordRevisions"][number];
  definitions: SylisLexiconArtifactV1["lexicon"]["definitions"];
  translations: SylisLexiconArtifactV1["lexicon"]["translationTexts"];
  forms: string[];
}

function contexts(artifact: SylisLexiconArtifactV1): SenseContext[] {
  const parentSenseIds = new Set(
    artifact.lexicon.senseRevisions.flatMap((sense) =>
      sense.parentSenseId ? [sense.parentSenseId] : [],
    ),
  );
  return artifact.lexicon.senseRevisions.flatMap((sense) => {
    if (parentSenseIds.has(sense.senseId)) return [];
    const entry = artifact.lexicon.entryRevisions.find(
      (candidate) => candidate.entryId === sense.entryId,
    );
    const headword = entry
      ? artifact.lexicon.headwordRevisions.find(
          (candidate) => candidate.headwordId === entry.headwordId,
        )
      : undefined;
    if (!entry || !headword) return [];
    const formIds = new Set(
      artifact.lexicon.forms
        .filter((form) => form.entryId === entry.entryId)
        .map((form) => form.id),
    );
    return [
      {
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
      },
    ];
  });
}

function evidence(context: SenseContext) {
  return {
    headword: context.headword.displayText,
    partOfSpeech: context.entry.partOfSpeech,
    senseId: context.sense.senseId,
    definitions: context.definitions.map((definition) => definition.text),
    translations: context.translations.map((translation) => translation.text),
    forms: context.forms,
  };
}

function upstreamProvenance(context: SenseContext): string[] {
  return [
    context.sense.provenanceId,
    ...context.definitions.map((definition) => definition.provenanceId),
    ...context.translations.map((translation) => translation.provenanceId),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function containsKnownForm(text: string, context: SenseContext): boolean {
  const comparable = normalizeComparableText(text);
  return context.forms.some((form) =>
    comparable.includes(normalizeComparableText(form)),
  );
}

async function enrichExamples(
  artifact: SylisLexiconArtifactV1,
  executor: StructuredTaskExecutor,
  candidatePort: LexicalCandidatePort,
  candidates: SenseContext[],
  progress: CompileProgressPort,
  offset: number,
  total: number,
): Promise<number> {
  let processed = offset;
  const executions =
    await executeLexicalCandidateTasks<ExampleGenerationCandidate>(
      executor,
      candidatePort,
      candidates.map((context) => ({
        taskType: LexicalCandidateTaskType.EXAMPLE_GENERATION,
        target: {
          kind: LexicalCandidateTargetKind.SENSE,
          targetKey: context.sense.senseId,
        },
        riskClass: LexicalCandidateRiskClass.MEDIUM,
        sourceRecordIds: sourceRecordIdsForProvenance(
          artifact,
          upstreamProvenance(context),
        ),
        schemaName: "sylis_example_generation",
        schema: exampleGenerationCandidateSchema,
        systemPrompt:
          "Generate one short bilingual learner example for exactly the supplied Sense. The English sentence must contain one supplied written form. Return null when the evidence cannot support an unambiguous example. Do not invent citations or source claims.",
        input: evidence(context),
        maxTokens: 320,
        semanticValidator: (candidate) =>
          candidate.example &&
          !containsKnownForm(candidate.example.text, context)
            ? "TARGET_FORM_NOT_MENTIONED"
            : null,
      })),
    );
  for (const [index, context] of candidates.entries()) {
    const execution = executions[index]!;
    const generated = execution.value?.example;
    if (generated) {
      const normalized = normalizeComparableText(generated.text);
      const existing = artifact.lexicon.examples.find(
        (example) =>
          example.languageTag === "en" &&
          normalizeComparableText(example.text) === normalized,
      );
      const provenanceId = ensureDerivedCandidateProvenance(
        artifact,
        execution.candidateKey,
        execution.candidateRevisionId!,
        execution.value,
        upstreamProvenance(context),
        "Generated example passed target-form and Sense-boundary validation.",
      );
      const exampleId =
        existing?.id ??
        stableId("example", "generated", execution.candidateKey);
      if (!existing) {
        artifact.lexicon.examples.push({
          id: exampleId,
          languageTag: "en",
          text: generated.text,
          normalizedText: normalizeIdentityText(generated.text),
          provenanceId,
        });
        artifact.lexicon.exampleTranslations.push({
          id: stableId("exampleTranslation", exampleId, "zh-CN"),
          exampleId,
          languageTag: "zh-CN",
          text: generated.translation,
          provenanceId,
        });
      }
      recordCandidatePromotionLineage(
        artifact,
        execution.candidateRevisionId!,
        "example",
        LexicalCandidatePromotionEntityType.EXAMPLE,
        exampleId,
      );
      if (
        !artifact.lexicon.senseExamples.some(
          (binding) =>
            binding.senseId === context.sense.senseId &&
            binding.exampleId === exampleId,
        )
      ) {
        artifact.lexicon.senseExamples.push({
          id: stableId("senseExample", context.sense.senseId, exampleId),
          senseId: context.sense.senseId,
          exampleId,
          displayOrder:
            artifact.lexicon.senseExamples.filter(
              (binding) => binding.senseId === context.sense.senseId,
            ).length + 1,
          role: "ILLUSTRATION",
          provenanceId,
        });
      }
    }
    processed += 1;
    await progress.report({
      stage: CompileStage.FACT_GAP_FILL,
      processed,
      total,
      aiInputTokens: execution.usage.inputTokens,
      aiOutputTokens: execution.usage.outputTokens,
      aiCostMicros: executor.spentMicros,
      message: "EXAMPLE_GENERATION",
    });
  }
  return processed;
}

async function enrichCollocations(
  artifact: SylisLexiconArtifactV1,
  executor: StructuredTaskExecutor,
  candidatePort: LexicalCandidatePort,
  candidates: SenseContext[],
  progress: CompileProgressPort,
  offset: number,
  total: number,
): Promise<number> {
  const builder = new LexicalStructureBuilder(artifact);
  let processed = offset;
  const executions =
    await executeLexicalCandidateTasks<CollocationEnrichmentCandidate>(
      executor,
      candidatePort,
      candidates.map((context) => ({
        taskType: LexicalCandidateTaskType.COLLOCATION_ENRICHMENT,
        target: {
          kind: LexicalCandidateTargetKind.SENSE,
          targetKey: context.sense.senseId,
        },
        riskClass: LexicalCandidateRiskClass.HIGH,
        sourceRecordIds: sourceRecordIdsForProvenance(
          artifact,
          upstreamProvenance(context),
        ),
        schemaName: "sylis_collocation_enrichment",
        schema: collocationEnrichmentCandidateSchema,
        systemPrompt:
          "Return at most three concise collocation candidates for exactly the supplied Sense. Every candidate must contain a supplied written form, have exactly one HEAD component, and use typed components. Return an empty array when evidence is insufficient.",
        input: evidence(context),
        maxTokens: 700,
        semanticValidator: (candidate) => {
          for (const collocation of candidate.collocations) {
            if (!containsKnownForm(collocation.text, context)) {
              return "TARGET_FORM_NOT_MENTIONED";
            }
            if (
              collocation.components.filter(
                (component) =>
                  component.role === CandidateCollocationComponentRole.HEAD,
              ).length !== 1
            ) {
              return "HEAD_COMPONENT_CARDINALITY";
            }
          }
          return null;
        },
      })),
    );
  for (const [index, context] of candidates.entries()) {
    const execution = executions[index]!;
    if (execution.value && execution.value.collocations.length > 0) {
      const provenanceId = ensureDerivedCandidateProvenance(
        artifact,
        execution.candidateKey,
        execution.candidateRevisionId!,
        execution.value,
        upstreamProvenance(context),
        "Generated collocations passed Sense and component validation.",
      );
      builder.addSenseStructures(
        context.entry.entryId,
        context.sense.senseId,
        "en",
        {
          sourceSenseKey: context.sense.senseId,
          partOfSpeech: context.entry.partOfSpeech,
          definitions: [],
          translations: [],
          examples: [],
          relations: [],
          tags: [],
          collocations: execution.value.collocations.map((collocation) => ({
            ...collocation,
            components: collocation.components.map((component) => ({
              ...component,
              targetText: component.targetText ?? undefined,
            })),
          })),
        },
        provenanceId,
      );
      for (const [
        collocationIndex,
        collocation,
      ] of execution.value.collocations.entries()) {
        recordCandidatePromotionLineage(
          artifact,
          execution.candidateRevisionId!,
          `collocation:${collocationIndex + 1}`,
          LexicalCandidatePromotionEntityType.COLLOCATION,
          stableId(
            "collocation",
            "en",
            normalizeIdentityText(collocation.text),
          ),
        );
      }
    }
    processed += 1;
    await progress.report({
      stage: CompileStage.FACT_GAP_FILL,
      processed,
      total,
      aiInputTokens: execution.usage.inputTokens,
      aiOutputTokens: execution.usage.outputTokens,
      aiCostMicros: executor.spentMicros,
      message: "COLLOCATION_ENRICHMENT",
    });
  }
  builder.finalize();
  return processed;
}

async function enrichFrames(
  artifact: SylisLexiconArtifactV1,
  executor: StructuredTaskExecutor,
  candidatePort: LexicalCandidatePort,
  candidates: SenseContext[],
  progress: CompileProgressPort,
  offset: number,
  total: number,
): Promise<void> {
  const builder = new LexicalStructureBuilder(artifact);
  let processed = offset;
  const executions = await executeLexicalCandidateTasks<SynsemFrameCandidate>(
    executor,
    candidatePort,
    candidates.map((context) => ({
      taskType: LexicalCandidateTaskType.SYNSEM_FRAME,
      target: {
        kind: LexicalCandidateTargetKind.SENSE,
        targetKey: context.sense.senseId,
      },
      riskClass: LexicalCandidateRiskClass.HIGH,
      sourceRecordIds: sourceRecordIdsForProvenance(
        artifact,
        upstreamProvenance(context),
      ),
      schemaName: "sylis_synsem_frame",
      schema: synsemFrameCandidateSchema,
      systemPrompt:
        "Return one conservative SynSem frame for exactly the supplied verb Sense. Use typed syntactic arguments and semantic roles. The display template and predicate must contain the supplied headword. Return null when the evidence is insufficient.",
      input: evidence(context),
      maxTokens: 700,
      semanticValidator: (candidate) =>
        candidate.frame &&
        (!containsKnownForm(candidate.frame.displayTemplate, context) ||
          normalizeComparableText(candidate.frame.predicate) !==
            normalizeComparableText(context.headword.displayText))
          ? "FRAME_TARGET_MISMATCH"
          : null,
    })),
  );
  for (const [index, context] of candidates.entries()) {
    const execution = executions[index]!;
    if (execution.value?.frame) {
      const provenanceId = ensureDerivedCandidateProvenance(
        artifact,
        execution.candidateKey,
        execution.candidateRevisionId!,
        execution.value,
        upstreamProvenance(context),
        "Generated SynSem frame passed predicate and target validation.",
      );
      const frame = execution.value.frame;
      builder.addSenseStructures(
        context.entry.entryId,
        context.sense.senseId,
        "en",
        {
          sourceSenseKey: context.sense.senseId,
          partOfSpeech: context.entry.partOfSpeech,
          definitions: [],
          translations: [],
          examples: [],
          relations: [],
          tags: [],
          frames: [
            {
              ...frame,
              arguments: frame.arguments.map((argument) => ({
                ...argument,
                marker: argument.marker ?? undefined,
                semanticRole: argument.semanticRole ?? undefined,
              })),
            },
          ],
        },
        provenanceId,
      );
      recordCandidatePromotionLineage(
        artifact,
        execution.candidateRevisionId!,
        "frame",
        LexicalCandidatePromotionEntityType.FRAME,
        stableId("frame", context.entry.entryId, frame.frameKey),
      );
    }
    processed += 1;
    await progress.report({
      stage: CompileStage.FACT_GAP_FILL,
      processed,
      total,
      aiInputTokens: execution.usage.inputTokens,
      aiOutputTokens: execution.usage.outputTokens,
      aiCostMicros: executor.spentMicros,
      message: "SYNSEM_FRAME",
    });
  }
  builder.finalize();
}

export async function enrichArtifactFacts(
  artifact: SylisLexiconArtifactV1,
  executor: StructuredTaskExecutor,
  candidatePort: LexicalCandidatePort,
  progress: CompileProgressPort,
): Promise<void> {
  const allContexts = contexts(artifact).filter(
    (context) =>
      context.definitions.length > 0 || context.translations.length > 0,
  );
  const exampleCandidates = allContexts.filter(
    (context) =>
      !artifact.lexicon.senseExamples.some(
        (binding) => binding.senseId === context.sense.senseId,
      ),
  );
  const collocationCandidates = allContexts.filter(
    (context) =>
      !artifact.lexicon.senseCollocations.some(
        (binding) => binding.senseId === context.sense.senseId,
      ),
  );
  const frameCandidates = allContexts.filter(
    (context) =>
      context.entry.partOfSpeech.includes("verb") &&
      !artifact.lexicon.senseFrames.some(
        (binding) => binding.senseId === context.sense.senseId,
      ),
  );
  const total =
    exampleCandidates.length +
    collocationCandidates.length +
    frameCandidates.length;
  let processed = await enrichExamples(
    artifact,
    executor,
    candidatePort,
    exampleCandidates,
    progress,
    0,
    total,
  );
  processed = await enrichCollocations(
    artifact,
    executor,
    candidatePort,
    collocationCandidates,
    progress,
    processed,
    total,
  );
  await enrichFrames(
    artifact,
    executor,
    candidatePort,
    frameCandidates,
    progress,
    processed,
    total,
  );
}
