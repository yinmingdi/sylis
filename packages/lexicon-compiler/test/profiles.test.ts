import {
  createEmptyArtifact,
  evaluateContentProfiles,
} from "@sylis/lexicon-artifact";
import { describe, expect, it } from "vitest";

import { stableId } from "../src/sources/source-context";

function profileFixture() {
  const artifact = createEmptyArtifact({
    lexiconKey: "profile-test",
    releaseVersion: "1",
    sourceLanguageTag: "en",
    learningLanguageTags: ["zh-CN"],
    compilerVersion: "1",
    gitCommit: "0".repeat(40),
    compileProfile: "fixture",
    validatorVersion: "fixture-validator/1",
    sourceManifestVersion: "sylis.source-manifest/1",
    sources: [
      {
        key: "fixture",
        version: "1",
        adapter: "ECDICT",
        checksum: `sha256:${"0".repeat(64)}`,
        materialization: null,
      },
    ],
    headwordSet: null,
    richTargetSet: null,
    ai: {
      enabled: false,
      promptVersion: null,
      candidateSchemaVersion: null,
      modelPolicyVersion: null,
      requestedIdentity: null,
      resolvedIdentity: null,
    },
  });
  const sourceRecordId = stableId("sourceRecord", "profile-test");
  const provenanceId = stableId("provenance", sourceRecordId, "direct");
  const headwordId = stableId("headword", "en:bank");
  const entryId = stableId("entry", headwordId, "lexinfo:noun");
  const formId = stableId("form", entryId, "canonical");
  const representationId = stableId("formRepresentation", formId, "written");
  const senseId = stableId("sense", entryId, "financial-institution");
  const definitionId = stableId("definition", senseId, "source");
  const translationId = stableId("translation", senseId, "zh-CN");
  const exampleId = stableId("example", senseId, "deposit");
  const senseExampleId = stableId("senseExample", senseId, exampleId);
  const objectiveId = stableId("objective", senseId, "receptive");
  const objectiveRevisionId = stableId("objectiveRevision", objectiveId, "1");
  const materialId = stableId("material", senseId, "explanation");
  const materialRevisionId = stableId("materialRevision", materialId, "1");
  const exerciseId = stableId("exercise", objectiveId, "meaning");
  const exerciseRevisionId = stableId("exerciseRevision", exerciseId, "1");

  artifact.sources.records.push({
    id: sourceRecordId,
    datasetVersionId: stableId("datasetVersion", "profile-test"),
    sourceKey: "bank",
    languageTag: "en",
    rawPayloadHash: `sha256:${"1".repeat(64)}`,
    rawPayloadUri: null,
    rawPayload: { word: "bank" },
  });
  artifact.provenance.bundles.push({
    id: provenanceId,
    kind: "SOURCE",
    contentHash: `sha256:${"2".repeat(64)}`,
    resolverVersion: "fixture/1",
    decisionReason: "Direct fixture evidence.",
  });
  artifact.provenance.evidence.push({
    id: stableId("evidence", provenanceId, sourceRecordId),
    provenanceId,
    evidenceKind: "DIRECT",
    sourceRecordId,
    upstreamProvenanceId: null,
    note: null,
  });
  artifact.lexicon.headwords.push({
    id: headwordId,
    identityKey: "en:bank",
    artifactRole: "CURRENT",
  });
  artifact.lexicon.headwordRevisions.push({
    headwordId,
    displayText: "bank",
    normalizedText: "bank",
    searchKey: "bank",
    sortKey: "bank",
  });
  artifact.lexicon.entries.push({
    id: entryId,
    identityKey: "en:bank:lexinfo:noun",
    artifactRole: "CURRENT",
  });
  artifact.lexicon.entryRevisions.push({
    entryId,
    headwordId,
    entryType: "WORD",
    partOfSpeech: "lexinfo:noun",
    homographNo: 1,
    displayOrder: 1,
    provenanceId,
  });
  artifact.lexicon.forms.push({
    id: formId,
    entryId,
    formType: "CANONICAL",
    displayOrder: 1,
    provenanceId,
  });
  artifact.lexicon.formRepresentations.push({
    id: representationId,
    formId,
    representationType: "WRITTEN",
    languageTag: "en",
    regionTag: null,
    scriptTag: null,
    text: "bank",
    normalizedText: "bank",
    provenanceId,
  });
  artifact.lexicon.senses.push({
    id: senseId,
    identityKey: "en:bank:financial-institution",
    artifactRole: "CURRENT",
  });
  artifact.lexicon.senseRevisions.push({
    senseId,
    entryId,
    parentSenseId: null,
    displayOrder: 1,
    provenanceId,
  });
  artifact.lexicon.definitions.push({
    id: definitionId,
    senseId,
    languageTag: "en",
    definitionType: "SOURCE",
    text: "A financial institution.",
    displayOrder: 1,
    provenanceId,
  });
  artifact.lexicon.translationTexts.push({
    id: translationId,
    senseId,
    languageTag: "zh-CN",
    text: "银行",
    registerTermId: null,
    displayOrder: 1,
    provenanceId,
  });
  artifact.lexicon.examples.push({
    id: exampleId,
    languageTag: "en",
    text: "She deposited the money in the bank.",
    normalizedText: "She deposited the money in the bank.",
    provenanceId,
  });
  artifact.lexicon.senseExamples.push({
    id: senseExampleId,
    senseId,
    exampleId,
    displayOrder: 1,
    role: "USAGE",
    provenanceId,
  });
  artifact.learning.learningObjectives.push({
    id: objectiveId,
    objectiveKey: "meaning:receptive:bank",
  });
  artifact.learning.objectiveRevisions.push({
    id: objectiveRevisionId,
    objectiveId,
    knowledgeFacet: "MEANING_FORM_MEANING",
    retrievalDirection: "RECEPTIVE",
    contentHash: `sha256:${"3".repeat(64)}`,
    provenanceId,
  });
  artifact.learning.objectiveSubjects.push({
    learningObjectiveRevisionId: objectiveRevisionId,
    subjectRole: "PRIMARY",
    target: { targetKind: "SENSE", targetId: senseId },
  });
  artifact.learning.pedagogicalMaterials.push({
    id: materialId,
    materialKey: "learner-explanation:bank",
  });
  artifact.learning.pedagogicalMaterialRevisions.push({
    id: materialRevisionId,
    materialId,
    materialKind: "LEARNER_EXPLANATION",
    learningLanguageTag: "en",
    supportLanguageTag: "zh-CN",
    audienceProfileKey: "general-adult-learner-v1",
    contentHash: `sha256:${"4".repeat(64)}`,
    provenanceId,
  });
  artifact.learning.pedagogicalMaterialTargets.push({
    materialRevisionId,
    targetRole: "PRIMARY",
    target: { targetKind: "SENSE", targetId: senseId },
  });
  artifact.learning.pedagogicalMaterialBlocks.push({
    id: stableId("materialBlock", materialRevisionId, "1"),
    materialRevisionId,
    blockKind: "TEXT",
    blockRole: "EXPLANATION",
    position: 1,
    languageTag: "en",
    text: "A financial institution.",
  });
  artifact.learning.exerciseItems.push({
    id: exerciseId,
    exerciseKey: "meaning-recall:bank",
    learningObjectiveId: objectiveId,
  });
  artifact.learning.exerciseRevisions.push({
    id: exerciseRevisionId,
    exerciseItemId: exerciseId,
    learningObjectiveRevisionId: objectiveRevisionId,
    exerciseTaskKind: "FORM_MEANING_MAPPING",
    evidenceKind: "CUED_RECALL",
    responseKind: "SHORT_TEXT",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
    prompt: { languageTag: "en", text: "Write one meaning of bank." },
    instructions: null,
    shuffleChoices: false,
    maxScore: 1,
    authoredDifficultyTier: "FOUNDATION",
    templateVersion: "fixture/1",
    generatorVersion: "fixture/1",
    verifierVersion: "fixture/1",
    contentHash: `sha256:${"5".repeat(64)}`,
    provenanceId,
  });

  return { artifact, entryId, senseId };
}

function statusFor(
  report: ReturnType<typeof evaluateContentProfiles>,
  profileKey: string,
  targetId: string,
) {
  const profile = report.profiles.find((value) => value.key === profileKey)!;
  const version = report.profileVersions.find(
    (value) => value.profileId === profile.id,
  )!;
  const evaluationIds = new Set(
    report.profileEvaluations
      .filter((value) => value.profileVersionId === version.id)
      .map((value) => value.id),
  );
  const target = report.profileEvaluationTargets.find(
    (value) =>
      evaluationIds.has(value.evaluationId) &&
      value.target.targetId === targetId,
  );
  return report.profileEvaluations.find(
    (value) => value.id === target?.evaluationId,
  )?.status;
}

describe("content profiles", () => {
  it("emits deterministic versioned profile evaluations and explicit applicability", () => {
    const { artifact, entryId, senseId } = profileFixture();
    const first = evaluateContentProfiles(artifact);
    const second = evaluateContentProfiles(artifact);

    expect(first).toEqual(second);
    expect(first.profiles.map((profile) => profile.key)).toEqual([
      "LEARNER_CORE",
      "LEXICON_PUBLISHABLE",
      "STUDY_READY",
    ]);
    expect(statusFor(first, "LEXICON_PUBLISHABLE", entryId)).toBe("PRESENT");
    expect(statusFor(first, "LEARNER_CORE", senseId)).toBe("PRESENT");
    expect(statusFor(first, "STUDY_READY", senseId)).toBe("PRESENT");
    expect(
      first.profileVersions.find(
        (version) =>
          first.profiles.find((profile) => profile.id === version.profileId)
            ?.key === "STUDY_READY",
      )?.version,
    ).toBe("2");
    expect(
      first.coverage
        .filter((value) =>
          [
            "COLLOCATION_EVIDENCE",
            "FRAME_EVIDENCE",
            "MORPHOLOGY_EVIDENCE",
          ].includes(value.requirementCode),
        )
        .map((value) => value.status),
    ).toEqual(["NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"]);
    expect(
      first.profileVersions.every((version) =>
        /^sha256:[a-f0-9]{64}$/.test(version.requirementsHash),
      ),
    ).toBe(true);
  });

  it("distinguishes missing learner content from rejected provenance", () => {
    const { artifact, entryId, senseId } = profileFixture();
    artifact.lexicon.translationTexts = [];
    artifact.provenance.evidence = [];

    const report = evaluateContentProfiles(artifact);
    expect(statusFor(report, "LEARNER_CORE", senseId)).toBe("MISSING");
    expect(statusFor(report, "STUDY_READY", senseId)).toBe("MISSING");
    expect(statusFor(report, "LEXICON_PUBLISHABLE", entryId)).toBe("REJECTED");
    expect(
      report.coverage.find(
        (value) => value.requirementCode === "PROVENANCE_CLOSED",
      ),
    ).toMatchObject({
      status: "REJECTED",
      reasonCode: "PROVENANCE_CLOSURE_INVALID",
    });
  });
});
