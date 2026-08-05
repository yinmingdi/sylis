import type {
  ArtifactManifest,
  ArtifactSourceInput,
  SylisLexiconArtifactV1,
} from "../types/artifact-v1";

export interface EmptyArtifactOptions {
  lexiconKey: string;
  releaseVersion: string;
  sourceLanguageTag: string;
  learningLanguageTags: readonly [string, ...string[]];
  compilerVersion: string;
  gitCommit: string;
  compileProfile: ArtifactManifest["build"]["compileProfile"];
  validatorVersion: string;
  sourceManifestVersion: "sylis.source-manifest/1";
  sources: readonly [ArtifactSourceInput, ...ArtifactSourceInput[]];
  headwordSet: ArtifactManifest["inputs"]["headwordSet"];
  richTargetSet: ArtifactManifest["inputs"]["richTargetSet"];
  ai: ArtifactManifest["ai"];
  unicodeVersion?: string;
  cldrVersion?: string;
  locale?: string;
}

const EMPTY_HASH = `sha256:${"0".repeat(64)}`;

export function createEmptyArtifact(
  options: EmptyArtifactOptions,
): SylisLexiconArtifactV1 {
  return {
    schemaVersion: "sylis.lexicon-artifact/1",
    manifest: {
      lexiconKey: options.lexiconKey,
      releaseVersion: options.releaseVersion,
      sourceLanguageTag: options.sourceLanguageTag,
      learningLanguageTags: [
        options.learningLanguageTags[0],
        ...options.learningLanguageTags.slice(1),
      ],
      builder: {
        package: "@sylis/lexicon-compiler",
        version: options.compilerVersion,
        gitCommit: options.gitCommit,
      },
      build: {
        compileProfile: options.compileProfile,
        validatorVersion: options.validatorVersion,
      },
      inputs: {
        sourceManifestVersion: options.sourceManifestVersion,
        sources: [options.sources[0], ...options.sources.slice(1)],
        headwordSet: options.headwordSet,
        richTargetSet: options.richTargetSet,
      },
      ai: options.ai,
      textProfile: {
        normalization: "NFC",
        unicodeVersion: options.unicodeVersion ?? "17.0.0",
        segmentation: "UAX29",
        cldrVersion: options.cldrVersion ?? "48",
        locale: options.locale ?? options.sourceLanguageTag,
      },
      canonicalization: "RFC8785+domain-array-order/1",
      contentHash: EMPTY_HASH,
      counts: {},
    },
    vocabularies: { bundles: [], namespaceVersions: [], terms: [] },
    sources: {
      datasets: [],
      datasetVersions: [],
      records: [],
      rightsPolicies: [],
      restrictions: [],
    },
    provenance: { bundles: [], evidence: [] },
    lexicon: {
      headwords: [],
      headwordRevisions: [],
      entries: [],
      entryRevisions: [],
      forms: [],
      formRepresentations: [],
      formFeatures: [],
      mediaAssets: [],
      formMedia: [],
      senses: [],
      senseRevisions: [],
      definitions: [],
      translationTexts: [],
      translationRelations: [],
      usages: [],
      concepts: [],
      conceptRevisions: [],
      conceptDefinitions: [],
      senseConceptMemberships: [],
      entryLineages: [],
      senseLineages: [],
      conceptLineages: [],
      entryRelations: [],
      senseRelations: [],
      conceptRelations: [],
      examples: [],
      exampleTranslations: [],
      senseExamples: [],
      citations: [],
      collocations: [],
      senseCollocations: [],
      collocationComponents: [],
      frames: [],
      syntacticArguments: [],
      predicates: [],
      semanticArguments: [],
      senseFrames: [],
      argumentMappings: [],
      morphology: {
        morphs: [],
        morphemes: [],
        analyses: [],
        segments: [],
        inflectionRules: [],
        inflectionGenerations: [],
        wordFormations: [],
        wordFormationInputs: [],
        wordFormationRules: [],
        wordFormationApplications: [],
      },
      etymology: {
        etymons: [],
        etymonRevisions: [],
        hypotheses: [],
        links: [],
      },
      corpora: {
        datasets: [],
        datasetVersions: [],
        frequencyObservations: [],
        attestations: [],
        collocationObservations: [],
      },
      externalIdentifiers: [],
    },
    learning: {
      books: [],
      bookEditions: [],
      bookItems: [],
      proficiencyFrameworks: [],
      proficiencyFrameworkVersions: [],
      proficiencyLevels: [],
      proficiencyClaims: [],
      learningObjectives: [],
      objectiveRevisions: [],
      objectiveSubjects: [],
      objectiveHints: [],
      pedagogicalMaterials: [],
      pedagogicalMaterialRevisions: [],
      pedagogicalMaterialTargets: [],
      pedagogicalMaterialBlocks: [],
      pedagogicalMaterialMentions: [],
      pedagogicalMaterialCitations: [],
      assessmentStimuli: [],
      stimulusRevisions: [],
      stimulusBlocks: [],
      exerciseStimulusRefs: [],
      exerciseItems: [],
      exerciseRevisions: [],
      exerciseResponseConfigs: [],
      exerciseChoices: [],
      exerciseChoiceTargets: [],
      correctResponses: [],
      exerciseFeedback: [],
      exerciseRubrics: [],
      assessmentBlueprints: [],
      assessmentBlueprintRevisions: [],
      assessmentSections: [],
      assessmentSelectionRules: [],
    },
    quality: {
      profiles: [],
      profileVersions: [],
      profileEvaluations: [],
      profileEvaluationTargets: [],
      coverage: [],
      validationSummary: {
        validatorVersion: options.validatorVersion,
        errorCount: 0,
        warningCount: 0,
        contentHash: EMPTY_HASH,
      },
      sourceStatistics: [],
      exerciseStatistics: [],
    },
  };
}
