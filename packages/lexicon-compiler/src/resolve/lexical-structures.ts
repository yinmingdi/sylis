import type {
  SenseUsage,
  SylisLexiconArtifactV1,
} from "@sylis/lexicon-contracts";
import { createHash } from "node:crypto";

import type {
  CandidateForm,
  CandidateSense,
  CandidateWordFormation,
} from "../candidates/candidate-v1";
import { normalizeIdentityText } from "../normalize/text-profile";
import { stableId } from "../sources/source-context";

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export class LexicalStructureBuilder {
  private readonly bundleId = stableId("vocabularyBundle", "compiler-terms-v1");
  private readonly namespaceVersionId = stableId(
    "vocabularyNamespace",
    "compiler-terms-v1",
  );

  constructor(private readonly artifact: SylisLexiconArtifactV1) {}

  private addCollocationExplanation(
    collocationId: string,
    languageTag: string,
    text: string,
    provenanceId: string,
  ): void {
    const normalized = normalizeIdentityText(text);
    const materialKey = `collocation-explanation:${collocationId}:${languageTag}:${stableId("content", normalized)}`;
    const materialId = stableId("material", materialKey);
    const revisionId = stableId("materialRevision", materialId, "v1");
    if (
      this.artifact.learning.pedagogicalMaterialRevisions.some(
        (revision) => revision.id === revisionId,
      )
    ) {
      return;
    }
    this.artifact.learning.pedagogicalMaterials.push({
      id: materialId,
      materialKey,
    });
    this.artifact.learning.pedagogicalMaterialRevisions.push({
      id: revisionId,
      materialId,
      materialKind: "LEARNER_EXPLANATION",
      learningLanguageTag: this.artifact.manifest.sourceLanguageTag,
      supportLanguageTag: languageTag,
      audienceProfileKey: "general-adult-learner-v1",
      contentHash: hash(
        `${collocationId}:${languageTag}:${normalizeIdentityText(text)}`,
      ),
      provenanceId,
    });
    this.artifact.learning.pedagogicalMaterialTargets.push({
      materialRevisionId: revisionId,
      targetRole: "PRIMARY",
      target: { targetKind: "COLLOCATION", targetId: collocationId },
    });
    this.artifact.learning.pedagogicalMaterialBlocks.push({
      id: stableId("materialBlock", revisionId, "1"),
      materialRevisionId: revisionId,
      blockKind: "TEXT",
      blockRole: "TRANSLATION",
      position: 1,
      languageTag,
      text,
    });
  }

  private term(code: string, label = code): string {
    const normalizedCode = normalizeIdentityText(code).replace(/\s+/g, "-");
    const id = stableId("term", "compiler", normalizedCode);
    if (
      !this.artifact.vocabularies.bundles.some(
        (bundle) => bundle.id === this.bundleId,
      )
    ) {
      this.artifact.vocabularies.bundles.push({
        id: this.bundleId,
        version: "v1",
        contentHash: hash("compiler-terms-v1"),
      });
      this.artifact.vocabularies.namespaceVersions.push({
        id: this.namespaceVersionId,
        bundleId: this.bundleId,
        namespaceUri: "https://sylis.example/vocab/compiler/",
        version: "v1",
        sourceUri: "https://sylis.example/vocab/compiler/v1",
        checksum: hash("compiler-terms-v1"),
      });
    }
    if (
      !this.artifact.vocabularies.terms.some((candidate) => candidate.id === id)
    ) {
      this.artifact.vocabularies.terms.push({
        id,
        namespaceVersionId: this.namespaceVersionId,
        code: normalizedCode,
        uri: `https://sylis.example/vocab/compiler/${encodeURIComponent(normalizedCode)}`,
        label,
        deprecated: false,
        replacedById: null,
      });
    }
    return id;
  }

  private entryIdFor(languageTag: string, targetText: string): string | null {
    const normalized = normalizeIdentityText(targetText);
    const headwordIds = new Set(
      this.artifact.lexicon.headwordRevisions
        .filter((headword) => headword.normalizedText === normalized)
        .map((headword) => headword.headwordId),
    );
    const candidates = this.artifact.lexicon.entryRevisions.filter((entry) =>
      headwordIds.has(entry.headwordId),
    );
    if (candidates.length !== 1) return null;
    const representation = this.artifact.lexicon.formRepresentations.find(
      (candidate) =>
        candidate.languageTag === languageTag &&
        candidate.normalizedText === normalized,
    );
    return representation ? candidates[0].entryId : null;
  }

  addInflection(
    entryId: string,
    baseFormId: string,
    outputFormId: string,
    form: CandidateForm,
    provenanceId: string,
  ): void {
    if (form.formType !== "INFLECTED" || form.features.length === 0) return;
    const featureKey = form.features
      .map((feature) => `${feature.feature}=${feature.value}`)
      .sort()
      .join("+");
    const ruleId = stableId("inflectionRule", featureKey);
    if (
      !this.artifact.lexicon.morphology.inflectionRules.some(
        (rule) => rule.id === ruleId,
      )
    ) {
      this.artifact.lexicon.morphology.inflectionRules.push({
        id: ruleId,
        ruleKey: `feature:${featureKey}`,
        version: "v1",
        ruleType: "INFLECTION",
        inputPattern: "CANONICAL_FORM",
        outputPattern: featureKey,
        provenanceId,
      });
    }
    const generationId = stableId(
      "inflectionGeneration",
      entryId,
      baseFormId,
      outputFormId,
    );
    if (
      !this.artifact.lexicon.morphology.inflectionGenerations.some(
        (generation) => generation.id === generationId,
      )
    ) {
      this.artifact.lexicon.morphology.inflectionGenerations.push({
        id: generationId,
        ruleId,
        entryId,
        baseFormId,
        outputFormId,
        provenanceId,
      });
    }
  }

  addSenseStructures(
    entryId: string,
    senseId: string,
    languageTag: string,
    sense: CandidateSense,
    provenanceId: string,
  ): void {
    for (const [index, usage] of (sense.usages ?? []).entries()) {
      if (!usage.value && !usage.text) continue;
      const key = `${senseId}:${usage.usageType}:${usage.value ?? usage.text}`;
      const id = stableId("senseUsage", key);
      if (this.artifact.lexicon.usages.some((candidate) => candidate.id === id))
        continue;
      this.artifact.lexicon.usages.push({
        id,
        senseId,
        usageTypeTermId: this.term(
          `usage-type:${usage.usageType}`,
          usage.usageType,
        ),
        valueTermId: usage.value
          ? this.term(`usage-value:${usage.value}`, usage.value)
          : null,
        text: usage.value ? null : (usage.text ?? null),
        displayOrder: index + 1,
        provenanceId,
      } as SenseUsage);
    }

    for (const collocation of sense.collocations ?? []) {
      const normalized = normalizeIdentityText(collocation.text);
      const collocationId = stableId("collocation", languageTag, normalized);
      if (
        !this.artifact.lexicon.collocations.some(
          (candidate) => candidate.id === collocationId,
        )
      ) {
        this.artifact.lexicon.collocations.push({
          id: collocationId,
          languageTag,
          canonicalText: collocation.text,
          normalizedText: normalized,
          headEntryId: entryId,
          provenanceId,
        });
        for (const [position, component] of collocation.components.entries()) {
          this.artifact.lexicon.collocationComponents.push({
            collocationId,
            position: position + 1,
            surfaceText: component.surfaceText,
            roleTermId: this.term(
              `collocation-role:${component.role}`,
              component.role,
            ),
            target:
              component.role === "HEAD"
                ? { targetKind: "ENTRY", targetId: entryId }
                : component.targetText
                  ? (() => {
                      const targetId = this.entryIdFor(
                        languageTag,
                        component.targetText,
                      );
                      return targetId
                        ? { targetKind: "ENTRY" as const, targetId }
                        : null;
                    })()
                  : null,
          });
        }
      }
      for (const translation of collocation.translations ?? []) {
        this.addCollocationExplanation(
          collocationId,
          translation.languageTag,
          translation.text,
          provenanceId,
        );
      }
      if (
        !this.artifact.lexicon.senseCollocations.some(
          (binding) =>
            binding.senseId === senseId &&
            binding.collocationId === collocationId,
        )
      ) {
        this.artifact.lexicon.senseCollocations.push({
          senseId,
          collocationId,
          relationType: collocation.relationType,
          displayOrder:
            this.artifact.lexicon.senseCollocations.filter(
              (binding) => binding.senseId === senseId,
            ).length + 1,
          provenanceId,
        });
      }
    }

    for (const frame of sense.frames ?? []) {
      const frameId = stableId("frame", entryId, frame.frameKey);
      if (
        !this.artifact.lexicon.frames.some(
          (candidate) => candidate.id === frameId,
        )
      ) {
        this.artifact.lexicon.frames.push({
          id: frameId,
          entryId,
          frameKey: frame.frameKey,
          frameTypeTermId: this.term(
            `frame-type:${frame.frameType}`,
            frame.frameType,
          ),
          languageTag,
          displayTemplate: frame.displayTemplate,
          provenanceId,
        });
      }
      const predicateId = frame.predicate
        ? stableId("predicate", senseId, frame.predicate)
        : null;
      if (
        predicateId &&
        !this.artifact.lexicon.predicates.some(
          (candidate) => candidate.id === predicateId,
        )
      ) {
        this.artifact.lexicon.predicates.push({
          id: predicateId,
          senseId,
          predicateKey: frame.predicate!,
          predicateTypeTermId: this.term("predicate-type:LEXICAL", "LEXICAL"),
          label: frame.predicate!,
          provenanceId,
        });
      }
      const senseFrameId = stableId("senseFrame", senseId, frameId);
      if (
        !this.artifact.lexicon.senseFrames.some(
          (candidate) => candidate.id === senseFrameId,
        )
      ) {
        this.artifact.lexicon.senseFrames.push({
          id: senseFrameId,
          senseId,
          frameId,
          predicateId,
          provenanceId,
        });
      }
      for (const [position, argument] of frame.arguments.entries()) {
        const argumentId = stableId(
          "syntacticArgument",
          frameId,
          String(position + 1),
        );
        if (
          !this.artifact.lexicon.syntacticArguments.some(
            (candidate) => candidate.id === argumentId,
          )
        ) {
          this.artifact.lexicon.syntacticArguments.push({
            id: argumentId,
            frameId,
            position: position + 1,
            functionTermId: this.term(
              `syntactic-function:${argument.syntacticFunction}`,
              argument.syntacticFunction,
            ),
            phraseTypeTermId: this.term(
              `phrase-type:${argument.phraseType}`,
              argument.phraseType,
            ),
            marker: argument.marker ?? null,
            optional: argument.optional,
          });
        }
        if (!predicateId || !argument.semanticRole) continue;
        const semanticArgumentId = stableId(
          "semanticArgument",
          predicateId,
          argument.semanticRole,
          String(position + 1),
        );
        if (
          !this.artifact.lexicon.semanticArguments.some(
            (candidate) => candidate.id === semanticArgumentId,
          )
        ) {
          this.artifact.lexicon.semanticArguments.push({
            id: semanticArgumentId,
            predicateId,
            roleTermId: this.term(
              `semantic-role:${argument.semanticRole}`,
              argument.semanticRole,
            ),
            position: position + 1,
          });
          this.artifact.lexicon.argumentMappings.push({
            senseFrameId,
            syntacticArgumentId: argumentId,
            semanticArgumentId,
          });
        }
      }
    }
  }

  addWordFormation(
    entryId: string,
    canonicalRepresentationId: string,
    formation: CandidateWordFormation,
    provenanceId: string,
  ): void {
    const analysisId = stableId(
      "morphologicalAnalysis",
      canonicalRepresentationId,
      formation.ruleKey,
    );
    if (
      !this.artifact.lexicon.morphology.analyses.some(
        (analysis) => analysis.id === analysisId,
      )
    ) {
      this.artifact.lexicon.morphology.analyses.push({
        id: analysisId,
        formRepresentationId: canonicalRepresentationId,
        analysisType: "DERIVATIONAL",
        provenanceId,
      });
    }
    const wordFormationId = stableId(
      "wordFormation",
      entryId,
      formation.ruleKey,
    );
    if (
      !this.artifact.lexicon.morphology.wordFormations.some(
        (candidate) => candidate.id === wordFormationId,
      )
    ) {
      this.artifact.lexicon.morphology.wordFormations.push({
        id: wordFormationId,
        targetEntryId: entryId,
        formationTypeTermId: this.term(
          `formation-type:${formation.formationType}`,
          formation.formationType,
        ),
        provenanceId,
      });
    }
    for (const [position, segment] of formation.segments.entries()) {
      const morphId = stableId("morph", segment.surfaceText);
      const morphemeId = stableId("morpheme", segment.morphemeKey);
      if (
        !this.artifact.lexicon.morphology.morphs.some(
          (candidate) => candidate.id === morphId,
        )
      ) {
        this.artifact.lexicon.morphology.morphs.push({
          id: morphId,
          identityKey: `en:morph:${normalizeIdentityText(segment.surfaceText)}`,
          artifactRole: "CURRENT",
        });
      }
      if (
        !this.artifact.lexicon.morphology.morphemes.some(
          (candidate) => candidate.id === morphemeId,
        )
      ) {
        this.artifact.lexicon.morphology.morphemes.push({
          id: morphemeId,
          identityKey: `en:morpheme:${normalizeIdentityText(segment.morphemeKey)}`,
          artifactRole: "CURRENT",
        });
      }
      if (
        !this.artifact.lexicon.morphology.segments.some(
          (candidate) =>
            candidate.analysisId === analysisId &&
            candidate.position === position + 1,
        )
      ) {
        this.artifact.lexicon.morphology.segments.push({
          analysisId,
          position: position + 1,
          startOffset: segment.startOffset,
          endOffset: segment.endOffset,
          surfaceText: segment.surfaceText,
          morphId,
          morphemeId,
          roleTermId: this.term(`morpheme-role:${segment.role}`, segment.role),
        });
        this.artifact.lexicon.morphology.wordFormationInputs.push({
          wordFormationId,
          position: position + 1,
          roleTermId: this.term(
            `formation-input:${segment.role}`,
            segment.role,
          ),
          target: { targetKind: "MORPHEME", targetId: morphemeId },
        });
      }
    }
    const ruleId = stableId("wordFormationRule", formation.ruleKey);
    if (
      !this.artifact.lexicon.morphology.wordFormationRules.some(
        (rule) => rule.id === ruleId,
      )
    ) {
      this.artifact.lexicon.morphology.wordFormationRules.push({
        id: ruleId,
        ruleKey: formation.ruleKey,
        version: "v1",
        ruleType: formation.formationType,
        inputPattern: formation.inputPattern,
        outputPattern: formation.outputPattern,
        provenanceId,
      });
      this.artifact.lexicon.morphology.wordFormationApplications.push({
        wordFormationId,
        ruleId,
        stepOrder: 1,
      });
    }
  }

  finalize(): void {
    const terms = [...this.artifact.vocabularies.terms].sort((left, right) =>
      left.code.localeCompare(right.code),
    );
    this.artifact.vocabularies.terms = terms;
    const contentHash = hash(terms.map((term) => term.code).join("\n"));
    const bundle = this.artifact.vocabularies.bundles.find(
      (candidate) => candidate.id === this.bundleId,
    );
    if (bundle) bundle.contentHash = contentHash;
    const namespace = this.artifact.vocabularies.namespaceVersions.find(
      (candidate) => candidate.id === this.namespaceVersionId,
    );
    if (namespace) namespace.checksum = contentHash;
  }
}
