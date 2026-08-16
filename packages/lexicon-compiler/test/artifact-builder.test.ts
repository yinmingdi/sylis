import { describe, expect, it } from "vitest";
import { ARTIFACT_VALIDATOR_VERSION } from "@sylis/lexicon-artifact";

import {
  CandidateSenseRelationType,
  SourceAdapterKind,
} from "../src/candidates/candidate-v1";
import type { NormalizedSourceRecord } from "../src/candidates/candidate-v1";
import type {
  ResolvedSource,
  SourceManifest,
} from "../src/manifest/source-manifest";
import { buildArtifact } from "../src/resolve/artifact-builder";
import { sourceContext } from "../src/sources/source-context";

const checksum = "0".repeat(64);
const source: ResolvedSource = {
  key: "kaikki-en",
  version: "fixture-1",
  retrievedAt: "2026-08-07T00:00:00.000Z",
  adapter: SourceAdapterKind.WIKTEXTRACT_EN,
  path: "fixture.jsonl",
  sourceUri: "https://example.com/fixture.jsonl",
  parserVersion: "wiktextract-en-parser/1",
  uri: "https://example.com/fixture.jsonl",
  checksum,
  sha256: checksum,
  rights: {
    mayBuild: true,
    mayServe: true,
    mayExport: true,
    requiresAttribution: false,
    effectiveFrom: "2026-08-07T00:00:00.000Z",
    effectiveTo: null,
  },
};
const manifest: SourceManifest = {
  manifestVersion: "sylis.source-manifest/1",
  release: {
    lexiconKey: "sylis-en-zh-test",
    releaseVersion: "fixture-1",
    sourceLanguageTag: "en",
    learningLanguageTags: ["zh-CN"],
    compilerVersion: "1.0.0",
    gitCommit: "0".repeat(40),
  },
  sources: [source],
};
const disabledAi = {
  enabled: false,
  promptVersion: null,
  candidateSchemaVersion: null,
  modelPolicyVersion: null,
  requestedIdentity: null,
  resolvedIdentity: null,
} as const;

describe("artifact source version metadata", () => {
  it("carries the parser, schema, validation, and lifecycle facts required by the publisher", () => {
    const artifact = buildArtifact(
      manifest,
      [source],
      [hierarchicalRecord(false, "To move.", "To move toward a place.")],
      {
        compileProfile: "fixture",
        headwordSet: null,
        richTargetSet: null,
        ai: disabledAi,
      },
    );

    expect(artifact.sources.datasetVersions).toEqual([
      expect.objectContaining({
        adapter: "WIKTEXTRACT_EN",
        parserVersion: "wiktextract-en-parser/1",
        schemaVersion: "sylis.lexicon-candidate/1",
        status: "VALIDATED",
        validationSummary: {
          recordCount: 1,
          errorCount: 0,
          warningCount: 0,
          validatorVersion: ARTIFACT_VALIDATOR_VERSION,
        },
      }),
    ]);
  });
});

function hierarchicalRecord(
  reverse: boolean,
  parentText: string,
  childText: string,
): NormalizedSourceRecord {
  const record = sourceContext(source, SourceAdapterKind.WIKTEXTRACT_EN, {
    sourceKey: "go:verb",
    rawPayload: {},
    languageTag: "en",
    headword: "go",
    partOfSpeech: "lexinfo:verb",
    senses: [
      {
        sourceSenseKey: "go:verb:20:parent:1",
        partOfSpeech: "lexinfo:verb",
        definitions: [
          {
            languageTag: "en",
            text: parentText,
          },
        ],
        translations: [],
        examples: [],
        relations: [],
        tags: [],
      },
      {
        sourceSenseKey: "go:verb:20",
        parentSourceSenseKey: "go:verb:20:parent:1",
        partOfSpeech: "lexinfo:verb",
        definitions: [
          {
            languageTag: "en",
            text: childText,
          },
        ],
        translations: [],
        examples: [],
        relations: [],
        tags: [],
      },
    ],
    forms: [],
    phonetics: [],
    books: [],
    independentEntryEvidence: true,
    formOfEvidence: [],
  });
  if (reverse) record.senses.reverse();
  return record;
}

function branchedHierarchyRecord(): NormalizedSourceRecord {
  const sense = (
    sourceSenseKey: string,
    text: string,
    parentSourceSenseKey?: string,
  ) => ({
    sourceSenseKey,
    parentSourceSenseKey,
    partOfSpeech: "lexinfo:verb",
    definitions: [{ languageTag: "en", text }],
    translations: [],
    examples: [],
    relations: [],
    tags: [],
  });
  return sourceContext(source, SourceAdapterKind.WIKTEXTRACT_EN, {
    sourceKey: "run:verb",
    rawPayload: {},
    languageTag: "en",
    headword: "run",
    partOfSpeech: "lexinfo:verb",
    senses: [
      sense("run:verb:6:parent:1", "To move swiftly."),
      sense(
        "run:verb:6",
        "To cause to move quickly or lightly.",
        "run:verb:6:parent:1",
      ),
      sense("run:verb:18:parent:1", "To flow."),
      sense(
        "run:verb:18",
        "To move or spread quickly.",
        "run:verb:18:parent:1",
      ),
    ],
    forms: [],
    phonetics: [],
    books: [],
    independentEntryEvidence: true,
    formOfEvidence: [],
  });
}

function duplicateRelationRecords(): NormalizedSourceRecord[] {
  const relation = (
    relationType:
      | CandidateSenseRelationType.HYPERNYM
      | CandidateSenseRelationType.SYNONYM,
  ) => ({
    relationType,
    targetText: "target",
  });
  const record = (
    sourceKey: string,
    headword: string,
    conceptExternalId: string,
    relations: ReturnType<typeof relation>[],
  ) =>
    sourceContext(source, SourceAdapterKind.WIKTEXTRACT_EN, {
      sourceKey,
      rawPayload: {},
      languageTag: "en",
      headword,
      partOfSpeech: "lexinfo:noun",
      senses: [
        {
          sourceSenseKey: `${sourceKey}:sense:1`,
          partOfSpeech: "lexinfo:noun",
          definitions: [{ languageTag: "en", text: `${headword} meaning` }],
          translations: [],
          examples: [],
          relations,
          conceptExternalId,
          tags: [],
        },
      ],
      forms: [],
      phonetics: [],
      books: [],
      independentEntryEvidence: true,
      formOfEvidence: [],
    });
  return [
    record("source", "source", "concept-source", [
      relation(CandidateSenseRelationType.HYPERNYM),
      relation(CandidateSenseRelationType.HYPERNYM),
      relation(CandidateSenseRelationType.SYNONYM),
      relation(CandidateSenseRelationType.SYNONYM),
    ]),
    record("target", "target", "concept-target", []),
  ];
}

function culturalContextRecord(text: string): NormalizedSourceRecord {
  return sourceContext(source, SourceAdapterKind.WIKTEXTRACT_EN, {
    sourceKey: "history:noun",
    rawPayload: {},
    languageTag: "en",
    headword: "history",
    partOfSpeech: "lexinfo:noun",
    senses: [
      {
        sourceSenseKey: "history:noun:1",
        partOfSpeech: "lexinfo:noun",
        definitions: [
          {
            languageTag: "en",
            text: "The aggregate of past events.",
          },
        ],
        translations: [],
        examples: [],
        relations: [],
        tags: [],
        culturalContexts: [{ languageTag: "en", text }],
      },
    ],
    forms: [],
    phonetics: [],
    books: [],
    independentEntryEvidence: true,
    formOfEvidence: [],
  });
}

describe("artifact sense hierarchy", () => {
  it.each(
    [
      {
        label: "similar definitions",
        parentText:
          "To become, move to or come to (a state, position, situation)",
        childText: "To move to (a position or state).",
      },
      {
        label: "identical normalized definitions",
        parentText: "To attack:",
        childText: "To attack.",
      },
    ].flatMap((definitions) =>
      [false, true].map((reverse) => ({ ...definitions, reverse })),
    ),
  )(
    "keeps an explicitly related parent and child distinct with $label and reverse=$reverse",
    ({ reverse, parentText, childText }) => {
      const artifact = buildArtifact(
        manifest,
        [source],
        [hierarchicalRecord(reverse, parentText, childText)],
        {
          compileProfile: "fixture",
          headwordSet: null,
          richTargetSet: null,
          ai: disabledAi,
        },
      );
      const parentDefinition = artifact.lexicon.definitions.find(
        (definition) => definition.text === parentText,
      )!;
      const childDefinition = artifact.lexicon.definitions.find(
        (definition) => definition.text === childText,
      )!;
      const childRevision = artifact.lexicon.senseRevisions.find(
        (revision) => revision.senseId === childDefinition.senseId,
      );

      expect(childDefinition.senseId).not.toBe(parentDefinition.senseId);
      expect(childRevision?.parentSenseId).toBe(parentDefinition.senseId);
    },
  );

  it("keeps similar children distinct when their source parent paths differ", () => {
    const artifact = buildArtifact(
      manifest,
      [source],
      [branchedHierarchyRecord()],
      {
        compileProfile: "fixture",
        headwordSet: null,
        richTargetSet: null,
        ai: disabledAi,
      },
    );
    const definitionByText = new Map(
      artifact.lexicon.definitions.map((definition) => [
        definition.text,
        definition,
      ]),
    );
    const firstChild = definitionByText.get(
      "To cause to move quickly or lightly.",
    )!;
    const secondChild = definitionByText.get("To move or spread quickly.")!;
    const revisionBySenseId = new Map(
      artifact.lexicon.senseRevisions.map((revision) => [
        revision.senseId,
        revision,
      ]),
    );

    expect(firstChild.senseId).not.toBe(secondChild.senseId);
    expect(revisionBySenseId.get(firstChild.senseId)?.parentSenseId).toBe(
      definitionByText.get("To move swiftly.")!.senseId,
    );
    expect(revisionBySenseId.get(secondChild.senseId)?.parentSenseId).toBe(
      definitionByText.get("To flow.")!.senseId,
    );
  });

  it("publishes one relation for duplicate source evidence", () => {
    const artifact = buildArtifact(
      manifest,
      [source],
      duplicateRelationRecords(),
      {
        compileProfile: "fixture",
        headwordSet: null,
        richTargetSet: null,
        ai: disabledAi,
      },
    );

    expect(artifact.lexicon.conceptRelations).toHaveLength(1);
    expect(artifact.lexicon.senseRelations).toHaveLength(1);
  });

  it("keeps source-backed material identity keys within the contract limit", () => {
    const sourceText = `From an extensively documented historical lineage ${"with additional source detail ".repeat(12)}`;
    const artifact = buildArtifact(
      manifest,
      [source],
      [culturalContextRecord(sourceText)],
      {
        compileProfile: "fixture",
        headwordSet: null,
        richTargetSet: null,
        ai: disabledAi,
      },
    );
    const revision = artifact.learning.pedagogicalMaterialRevisions.find(
      (candidate) => candidate.materialKind === "CULTURAL_CONTEXT",
    )!;
    const material = artifact.learning.pedagogicalMaterials.find(
      (candidate) => candidate.id === revision.materialId,
    )!;
    const block = artifact.learning.pedagogicalMaterialBlocks.find(
      (candidate) => candidate.materialRevisionId === revision.id,
    )!;

    expect(material.materialKey.length).toBeLessThanOrEqual(160);
    expect(material.materialKey).not.toContain(sourceText);
    expect(block).toEqual(expect.objectContaining({ text: sourceText }));
  });
});
