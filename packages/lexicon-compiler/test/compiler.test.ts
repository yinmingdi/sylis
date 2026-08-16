import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  canonicalContentHash,
  canonicalJsonChunks,
  sortArtifactArrays,
  validateArtifactStream,
  validationSummaryContentHash,
} from "@sylis/lexicon-artifact";
import { describe, expect, it } from "vitest";

import {
  LexicalCandidateDisposition,
  type LexicalCandidatePort,
  type LexicalCandidateSubmission,
  LexicalCandidateTaskType,
} from "../src/candidates/lexical-candidate";
import {
  compileLexicon,
  compileLexiconInternal,
  CompileProfile,
} from "../src/compiler";
import { MemoryCandidateCache } from "../src/enrich/candidate-cache";
import { enrichLearningContent } from "../src/enrich/learning-enricher";
import { StructuredTaskExecutor } from "../src/enrich/structured-task-executor";
import { readArtifact } from "../src/export/artifact-writer";
import { createSingleFrameZstdCompress } from "../src/export/zstd-envelope";
import {
  type HeadwordSelector,
  loadHeadwordSet,
  loadRichTargetSet,
  parseHeadwordSet,
  parseSourceManifest,
  PedagogicalMaterialKind,
  type RichTargetSet,
  type SourceManifest,
  sha256File,
} from "../src/manifest/source-manifest";
import { silentProgress } from "../src/progress/reporter";
import { resolveFormStatus } from "../src/resolve/form";
import { stableId } from "../src/sources/source-context";
import type { StructuredGenerationRequest } from "../src/ports/structured-generation";
import { FakeStructuredGenerationPort } from "./fake-generation";

const fixtureRoot = resolve(import.meta.dirname, "fixtures");
const pilotHeadwordSetPath = resolve(
  import.meta.dirname,
  "../data/pilot-headwords-v1.json",
);
const pilotRichTargetSetPath = resolve(
  import.meta.dirname,
  "../data/pilot-rich-targets-v1.json",
);
const PILOT_HEADWORD_SET_SHA256 =
  "b9c0935fa2190cb0a230215daeea274045cd29d1e9eb62bb404fdbd917c3dd8b";
const PILOT_RICH_TARGET_SET_SHA256 =
  "2284d4da116ca78c955ef34d61c08c5af3d74e5cdb96ecdc23240287f1ac24d3";

const FIXTURE_PUBLISHED_HEADWORDS: HeadwordSelector[] = [
  "bank",
  "branch",
  "break",
  "broken",
  "cafélike",
  "department",
  "dept",
  "helpful",
  "institution",
  "kick the bucket",
  "prevent",
  "run",
  "take off",
  "unhelpful",
  "useful",
].map((normalizedHeadword) => ({ languageTag: "en", normalizedHeadword }));

interface ManifestFixtureOptions {
  headwords?: HeadwordSelector[];
  reverseSources?: boolean;
  rights?: {
    mayBuild: boolean;
    mayServe: boolean;
    mayExport: boolean;
    requiresAttribution: boolean;
    attribution?: string;
  };
}

async function createManifest(
  root: string,
  options: ManifestFixtureOptions = {},
): Promise<string> {
  const fixtureNames = [
    ["ecdict", "ecdict.csv", "ECDICT"],
    ["kaikki", "kaikki.jsonl", "WIKTEXTRACT_EN"],
    ["oewn", "oewn.xml", "WN_LMF"],
    ["youdao", "youdao.ndjson", "YOUDAO_NDJSON"],
  ] as const;
  const sources = await Promise.all(
    fixtureNames.map(async ([key, filename, adapter]) => ({
      key,
      version: "fixture-1",
      retrievedAt: "2026-08-07T00:00:00.000Z",
      uri: join(fixtureRoot, filename),
      sha256: await sha256File(join(fixtureRoot, filename)),
      adapter,
      homepageUri: `https://example.com/${key}`,
      rights: {
        effectiveFrom: "2026-08-07T00:00:00.000Z",
        effectiveTo: null,
        ...(options.rights ?? {
          mayBuild: true,
          mayServe: true,
          mayExport: true,
          requiresAttribution: false,
        }),
      },
    })),
  );
  const richTargetPath = join(root, "rich-targets.json");
  await writeFile(
    richTargetPath,
    JSON.stringify({
      targetSetVersion: "sylis.rich-target-set/1",
      version: "fixture-1",
      targets: [
        {
          key: "helpful-primary",
          languageTag: "en",
          headword: "helpful",
          partOfSpeech: "lexinfo:adjective",
          senseDefinitionContains: "providing useful assistance",
          materialKinds: ["MNEMONIC", "MICRO_STORY"],
          generateStudyHint: true,
          generateExercise: true,
        },
      ],
    }),
  );
  const orderedSources = options.reverseSources ? sources.reverse() : sources;
  let selection:
    | {
        headwordSet: { version: string; path: string; sha256: string };
      }
    | undefined;
  if (options.headwords) {
    const headwordSetPath = join(root, "headwords.json");
    await writeFile(
      headwordSetPath,
      JSON.stringify({
        headwordSetVersion: "sylis.headword-set/1",
        version: "fixture-1",
        headwords: options.headwords,
      }),
    );
    selection = {
      headwordSet: {
        version: "fixture-1",
        path: basename(headwordSetPath),
        sha256: await sha256File(headwordSetPath),
      },
    };
  }
  const path = join(root, "manifest.json");
  await writeFile(
    path,
    JSON.stringify({
      manifestVersion: "sylis.source-manifest/1",
      release: {
        lexiconKey: "sylis-en-zh-test",
        releaseVersion: "2026.08.04.1",
        sourceLanguageTag: "en",
        learningLanguageTags: ["zh-CN"],
        compilerVersion: "1.0.0",
        gitCommit: "0".repeat(40),
      },
      selection,
      pedagogy: {
        audienceProfileKey: "zh-general-adult-en-v1",
        learningLanguageTag: "en",
        supportLanguageTag: "zh-CN",
        richTargetSet: {
          version: "fixture-1",
          path: basename(richTargetPath),
          sha256: await sha256File(richTargetPath),
        },
      },
      sources: orderedSources,
    }),
  );
  return path;
}

async function writeCompressedJson(
  path: string,
  value: unknown,
): Promise<void> {
  await pipeline(
    Readable.from(canonicalJsonChunks(value)),
    createSingleFrameZstdCompress(),
    createWriteStream(path),
  );
}

function learningResponse(
  request: StructuredGenerationRequest,
  rejectedTask?: "PEDAGOGICAL_MATERIAL_VERIFICATION" | "EXERCISE_VERIFICATION",
): unknown {
  const input = request.input as {
    materialKind?: "MNEMONIC" | "MICRO_STORY";
    headword?: string;
    correctAnswer?: string;
    distractorPool?: string[];
  };
  switch (request.taskType) {
    case "PEDAGOGICAL_MATERIAL_GENERATION":
      return input.materialKind === "MICRO_STORY"
        ? {
            materialKind: "MICRO_STORY",
            blocks: [
              {
                role: "STORY",
                languageTag: "en",
                text: `A ${input.headword} guide showed us the way home.`,
              },
              {
                role: "TRANSLATION",
                languageTag: "zh-CN",
                text: "一位向导为我们指出了回家的路。",
              },
            ],
          }
        : {
            materialKind: "MNEMONIC",
            blocks: [
              {
                role: "EXPLANATION",
                languageTag: "zh-CN",
                text: "把它联想成主动提供帮助的特征。",
              },
            ],
          };
    case "PEDAGOGICAL_MATERIAL_VERIFICATION":
    case "EXERCISE_VERIFICATION":
      return request.taskType === rejectedTask
        ? { verdict: "REJECTED", reasonCodes: ["FIXTURE_REJECTION"] }
        : { verdict: "APPROVED", reasonCodes: [] };
    case "EXERCISE_GENERATION":
      return {
        exerciseTaskKind: "FORM_MEANING_MAPPING",
        prompt: "选择与目标词对应的含义。",
        choices: [
          input.correctAnswer,
          ...(input.distractorPool ?? []).slice(0, 3),
        ].map((text, index) => ({
          localId: `choice:${index + 1}`,
          text,
          correct: index === 0,
          distractorKind: index === 0 ? null : "SAME_POS",
          rationale: index === 0 ? "Matches the source." : "Different Sense.",
        })),
        correctResponse: input.correctAnswer,
        feedbackCorrect: "回答正确。",
        feedbackIncorrect: "请重新核对目标义项。",
        authoredDifficultyTier: "FOUNDATION",
      };
    default:
      throw new Error(`Unexpected learning task ${request.taskType}`);
  }
}

function createLearningExecutor(
  generation: FakeStructuredGenerationPort,
): StructuredTaskExecutor {
  return new StructuredTaskExecutor(
    {
      enabled: true,
      budgetUsd: "1.00",
      concurrency: 2,
      pricing: { inputUsdPerMillion: "1", outputUsdPerMillion: "2" },
      promptVersion: "fixture/v1",
      schemaVersion: "sylis.ai-candidate/1",
      modelPolicyVersion: "fixture/v1",
      requestedProvider: "fake",
      requestedModel: "fixture",
    },
    {
      generation,
      resolvedIdentity: { provider: "fake", model: "fixture" },
      cache: new MemoryCandidateCache(),
    },
  );
}

describe("lexicon compiler", () => {
  it("distinguishes inflected forms from independent entries using combined evidence", () => {
    expect(
      resolveFormStatus([
        { formOfEvidence: ["break"], independentEntryEvidence: true },
      ]),
    ).toBe("BOTH");
    expect(
      resolveFormStatus([
        { formOfEvidence: ["run"], independentEntryEvidence: false },
      ]),
    ).toBe("INFLECTED_ONLY");
    expect(
      resolveFormStatus([
        { formOfEvidence: [], independentEntryEvidence: true },
      ]),
    ).toBe("INDEPENDENT_ONLY");
  });

  it("LEXICON-001-INTEGRATION compiles all source adapters into a deterministic validated artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-compiler-"));
    const manifestPath = await createManifest(root);
    const firstOutput = join(root, "first.json.zst");
    const secondOutput = join(root, "second.json.zst");
    const first = await compileLexicon({
      manifestPath,
      profile: CompileProfile.FIXTURE,
      outputPath: firstOutput,
      workRoot: join(root, "work-1"),
    });
    const second = await compileLexicon({
      manifestPath,
      profile: CompileProfile.FIXTURE,
      outputPath: secondOutput,
      workRoot: join(root, "work-2"),
    });
    const resumeEvents: string[] = [];
    const resumedOutput = join(root, "resumed.json.zst");
    await compileLexicon(
      {
        manifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: resumedOutput,
        workRoot: join(root, "work-1"),
        resumeRunId: first.runId,
      },
      {
        progress: {
          report(event) {
            resumeEvents.push(event.stage);
          },
        },
      },
    );

    expect(first.contentHash).toBe(second.contentHash);
    expect(first.artifactSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.artifactManifest.counts["/lexicon/senseRevisions"]).toBe(
      first.artifactManifest.counts["/lexicon/senseConceptMemberships"],
    );
    expect(first.artifactManifest).toMatchObject({
      build: {
        compileProfile: "fixture",
        validatorVersion: "lexicon-compiler-global/1",
      },
      inputs: {
        sourceManifestVersion: "sylis.source-manifest/1",
        headwordSet: null,
        richTargetSet: {
          schemaVersion: "sylis.rich-target-set/1",
          version: "fixture-1",
        },
      },
      ai: { enabled: false },
    });
    expect(
      first.artifactManifest.inputs.sources.map((source) => source.key),
    ).toEqual(["ecdict", "kaikki", "oewn", "youdao"]);
    expect(
      first.artifactManifest.inputs.sources.every((source) =>
        /^sha256:[a-f0-9]{64}$/.test(source.checksum),
      ),
    ).toBe(true);
    expect(await readFile(firstOutput)).toEqual(await readFile(secondOutput));
    expect(await readFile(resumedOutput)).toEqual(await readFile(firstOutput));
    expect(resumeEvents).not.toContain("HEADWORD_RESOLUTION");

    const learningCheckpointPath = join(
      root,
      "work-1",
      first.runId,
      "learning-content.checkpoint.json",
    );
    const incompatibleCheckpoint = JSON.parse(
      await readFile(learningCheckpointPath, "utf8"),
    ) as { handlerVersion: string };
    incompatibleCheckpoint.handlerVersion = "learning-content/incompatible";
    await writeFile(
      learningCheckpointPath,
      `${JSON.stringify(incompatibleCheckpoint)}\n`,
    );
    await expect(
      compileLexicon({
        manifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: join(root, "incompatible-resume.json.zst"),
        workRoot: join(root, "work-1"),
        resumeRunId: first.runId,
      }),
    ).rejects.toThrow("CHECKPOINT_INPUT_MISMATCH:EXERCISES_BLUEPRINTS");

    const streamed = await validateArtifactStream(firstOutput, {
      expectedContentHash: first.contentHash,
    });
    expect(streamed.counts["/lexicon/headwords"]).toBe(first.headwordCount);
    expect(streamed.idCount).toBeGreaterThan(0);
    expect(streamed.referenceCount).toBeGreaterThan(0);
    expect(streamed.profileSummary).toHaveLength(3);
    expect(streamed.coverageSummary.length).toBeGreaterThan(0);
    expect(streamed.exerciseStatistics.length).toBeGreaterThan(0);
    expect(streamed.sample.length).toBeGreaterThan(0);
    expect(streamed.sample.length).toBeLessThanOrEqual(20);
    await expect(
      validateArtifactStream(firstOutput, { maxEntityBytes: 16 }),
    ).rejects.toThrow("exceeds the byte limit");
    const artifact = await readArtifact(firstOutput);
    expect(canonicalContentHash(artifact)).toBe(artifact.manifest.contentHash);
    expect(artifact.quality.validationSummary).toMatchObject({
      validatorVersion: "lexicon-compiler-global/1",
      errorCount: 0,
      warningCount: 0,
    });
    expect(artifact.quality.validationSummary.contentHash).toBe(
      validationSummaryContentHash(artifact.quality.validationSummary),
    );

    const validatorMismatchArtifact = structuredClone(artifact);
    validatorMismatchArtifact.manifest.build.validatorVersion =
      "other-validator/1";
    validatorMismatchArtifact.manifest.contentHash = canonicalContentHash(
      validatorMismatchArtifact,
    );
    const validatorMismatchPath = join(root, "validator-mismatch.json.zst");
    await writeCompressedJson(validatorMismatchPath, validatorMismatchArtifact);
    await expect(validateArtifactStream(validatorMismatchPath)).rejects.toThrow(
      "Artifact validator version mismatch",
    );

    const sourceInputMismatchArtifact = structuredClone(artifact);
    sourceInputMismatchArtifact.manifest.inputs.sources[0]!.checksum = `sha256:${"f".repeat(64)}`;
    sourceInputMismatchArtifact.manifest.contentHash = canonicalContentHash(
      sourceInputMismatchArtifact,
    );
    const sourceInputMismatchPath = join(
      root,
      "source-input-mismatch.json.zst",
    );
    await writeCompressedJson(
      sourceInputMismatchPath,
      sourceInputMismatchArtifact,
    );
    await expect(
      validateArtifactStream(sourceInputMismatchPath),
    ).rejects.toThrow("source inputs do not match source dataset versions");

    const longStringArtifact = structuredClone(artifact);
    longStringArtifact.sources.records[0]!.rawPayload = "x".repeat(2_048);
    longStringArtifact.manifest.contentHash =
      canonicalContentHash(longStringArtifact);
    const longStringPath = join(root, "long-string.json.zst");
    await writeCompressedJson(longStringPath, longStringArtifact);
    await expect(
      validateArtifactStream(longStringPath, { maxStringBytes: 512 }),
    ).rejects.toThrow("Artifact string exceeds the byte limit");

    const deepArtifact = structuredClone(artifact);
    let nestedPayload: unknown = "leaf";
    for (let depth = 0; depth < 20; depth += 1) {
      nestedPayload = [nestedPayload];
    }
    deepArtifact.sources.records[0]!.rawPayload =
      nestedPayload as (typeof deepArtifact.sources.records)[number]["rawPayload"];
    deepArtifact.manifest.contentHash = canonicalContentHash(deepArtifact);
    const deepPath = join(root, "deep.json.zst");
    await writeCompressedJson(deepPath, deepArtifact);
    await expect(
      validateArtifactStream(deepPath, { maxDepth: 16 }),
    ).rejects.toThrow("Artifact JSON exceeds the depth limit");

    const forbiddenRightsArtifact = structuredClone(artifact);
    forbiddenRightsArtifact.sources.rightsPolicies[0]!.mayServe = false;
    forbiddenRightsArtifact.manifest.contentHash = canonicalContentHash(
      forbiddenRightsArtifact,
    );
    const forbiddenRightsPath = join(root, "forbidden-rights.json.zst");
    await writeCompressedJson(forbiddenRightsPath, forbiddenRightsArtifact);
    await expect(validateArtifactStream(forbiddenRightsPath)).rejects.toThrow(
      "SOURCE_RIGHTS_SERVE_FORBIDDEN",
    );

    const invalidCountArtifact = structuredClone(artifact);
    invalidCountArtifact.manifest.counts["/lexicon/headwords"] += 1;
    const invalidCountPath = join(root, "invalid-count.json.zst");
    await writeCompressedJson(invalidCountPath, invalidCountArtifact);
    await expect(validateArtifactStream(invalidCountPath)).rejects.toThrow(
      "Artifact count mismatch at /lexicon/headwords",
    );

    const changedContentArtifact = structuredClone(artifact);
    changedContentArtifact.lexicon.definitions[0]!.text += " changed";
    const changedContentPath = join(root, "changed-content.json.zst");
    await writeCompressedJson(changedContentPath, changedContentArtifact);
    await expect(validateArtifactStream(changedContentPath)).rejects.toThrow(
      "Artifact content hash mismatch",
    );

    const missingReferenceArtifact = structuredClone(artifact);
    const missingProvenanceId = "00000000-0000-4000-8000-ffffffffffff";
    missingReferenceArtifact.lexicon.definitions[0]!.provenanceId =
      missingProvenanceId;
    sortArtifactArrays(missingReferenceArtifact);
    missingReferenceArtifact.manifest.contentHash = canonicalContentHash(
      missingReferenceArtifact,
    );
    const missingReferencePath = join(root, "missing-reference.json.zst");
    await writeCompressedJson(missingReferencePath, missingReferenceArtifact);
    await expect(validateArtifactStream(missingReferencePath)).rejects.toThrow(
      `Artifact missing reference ${missingProvenanceId}`,
    );

    const unstableOrderArtifact = structuredClone(artifact);
    unstableOrderArtifact.lexicon.headwords.reverse();
    unstableOrderArtifact.manifest.contentHash = canonicalContentHash(
      unstableOrderArtifact,
    );
    const unstableOrderPath = join(root, "unstable-order.json.zst");
    await writeCompressedJson(unstableOrderPath, unstableOrderArtifact);
    await expect(validateArtifactStream(unstableOrderPath)).rejects.toThrow(
      "is not in stable order",
    );

    const cyclicSenseArtifact = structuredClone(artifact);
    cyclicSenseArtifact.lexicon.senseRevisions[0]!.parentSenseId =
      cyclicSenseArtifact.lexicon.senseRevisions[0]!.senseId;
    sortArtifactArrays(cyclicSenseArtifact);
    cyclicSenseArtifact.manifest.contentHash =
      canonicalContentHash(cyclicSenseArtifact);
    const cyclicSensePath = join(root, "cyclic-sense.json.zst");
    await writeCompressedJson(cyclicSensePath, cyclicSenseArtifact);
    await expect(validateArtifactStream(cyclicSensePath)).rejects.toThrow(
      "SENSE_PARENT_CYCLE",
    );

    const profileMismatchArtifact = structuredClone(artifact);
    profileMismatchArtifact.quality.profileEvaluations[0]!.status =
      profileMismatchArtifact.quality.profileEvaluations[0]!.status ===
      "PRESENT"
        ? "MISSING"
        : "PRESENT";
    sortArtifactArrays(profileMismatchArtifact);
    profileMismatchArtifact.manifest.contentHash = canonicalContentHash(
      profileMismatchArtifact,
    );
    const profileMismatchPath = join(root, "profile-mismatch.json.zst");
    await writeCompressedJson(profileMismatchPath, profileMismatchArtifact);
    await expect(validateArtifactStream(profileMismatchPath)).rejects.toThrow(
      "Artifact content profile mismatch",
    );

    const missingCollectionArtifact = structuredClone(artifact);
    delete (
      missingCollectionArtifact.quality as unknown as Record<string, unknown>
    ).coverage;
    missingCollectionArtifact.manifest.contentHash = canonicalContentHash(
      missingCollectionArtifact,
    );
    const missingCollectionPath = join(root, "missing-collection.json.zst");
    await writeCompressedJson(missingCollectionPath, missingCollectionArtifact);
    await expect(validateArtifactStream(missingCollectionPath)).rejects.toThrow(
      "missing required properties: coverage",
    );

    const invalidValidationSummaryArtifact = structuredClone(artifact);
    invalidValidationSummaryArtifact.quality.validationSummary.contentHash = `sha256:${"0".repeat(64)}`;
    invalidValidationSummaryArtifact.manifest.contentHash =
      canonicalContentHash(invalidValidationSummaryArtifact);
    const invalidValidationSummaryPath = join(
      root,
      "invalid-validation-summary.json.zst",
    );
    await writeCompressedJson(
      invalidValidationSummaryPath,
      invalidValidationSummaryArtifact,
    );
    await expect(
      validateArtifactStream(invalidValidationSummaryPath),
    ).rejects.toThrow("Artifact validation summary hash mismatch");

    const compressed = await readFile(firstOutput);
    const truncatedPath = join(root, "truncated.json.zst");
    await writeFile(
      truncatedPath,
      compressed.subarray(0, Math.max(1, Math.floor(compressed.length / 2))),
    );
    await expect(validateArtifactStream(truncatedPath)).rejects.toThrow();

    const trailingPath = join(root, "trailing.json.zst");
    await writeFile(
      trailingPath,
      Buffer.concat([compressed, Buffer.from([0])]),
    );
    await expect(validateArtifactStream(trailingPath)).rejects.toThrow(
      "ARTIFACT_ZSTD_TRAILING_DATA",
    );

    const multipleFramesPath = join(root, "multiple-frames.json.zst");
    await writeFile(
      multipleFramesPath,
      Buffer.concat([compressed, compressed]),
    );
    await expect(validateArtifactStream(multipleFramesPath)).rejects.toThrow(
      "ARTIFACT_ZSTD_TRAILING_DATA",
    );
    await expect(
      validateArtifactStream(firstOutput, {
        maxCompressedBytes: compressed.length - 1,
      }),
    ).rejects.toThrow("ARTIFACT_COMPRESSED_LIMIT_EXCEEDED");
    await expect(
      validateArtifactStream(firstOutput, { maxCompressionRatio: 1 }),
    ).rejects.toThrow("compression ratio limit");

    expect(artifact.lexicon.headwords.length).toBeGreaterThanOrEqual(7);

    const bankHeadword = artifact.lexicon.headwordRevisions.find(
      (headword) => headword.normalizedText === "bank",
    )!;
    const bankEntries = artifact.lexicon.entryRevisions.filter(
      (entry) => entry.headwordId === bankHeadword.headwordId,
    );
    expect(new Set(bankEntries.map((entry) => entry.partOfSpeech))).toEqual(
      new Set(["lexinfo:noun", "lexinfo:verb"]),
    );

    const runHeadword = artifact.lexicon.headwordRevisions.find(
      (headword) => headword.normalizedText === "run",
    )!;
    const runEntryIds = new Set(
      artifact.lexicon.entryRevisions
        .filter((entry) => entry.headwordId === runHeadword.headwordId)
        .map((entry) => entry.entryId),
    );
    const ranRepresentation = artifact.lexicon.formRepresentations.find(
      (representation) => representation.normalizedText === "ran",
    )!;
    const ranForm = artifact.lexicon.forms.find(
      (form) => form.id === ranRepresentation.formId,
    )!;
    expect(runEntryIds.has(ranForm.entryId)).toBe(true);
    expect(ranForm.formType).toBe("INFLECTED");

    const brokenHeadword = artifact.lexicon.headwordRevisions.find(
      (headword) => headword.normalizedText === "broken",
    );
    expect(brokenHeadword).toBeDefined();
    expect(
      artifact.lexicon.formRepresentations.some(
        (representation) => representation.normalizedText === "broken",
      ),
    ).toBe(true);
    expect(artifact.lexicon.concepts.length).toBeGreaterThanOrEqual(2);
    expect(artifact.lexicon.senseRelations.length).toBeGreaterThan(0);
    expect(artifact.lexicon.conceptRelations.length).toBeGreaterThan(0);
    expect(
      artifact.quality.sourceStatistics.find(
        (statistic) => statistic.key === "unresolved-sense-relation",
      )?.count,
    ).toBeGreaterThan(0);
    expect(
      artifact.lexicon.collocations.some(
        (collocation) => collocation.canonicalText === "helpful advice",
      ),
    ).toBe(true);
    expect(
      artifact.lexicon.collocationComponents.length,
    ).toBeGreaterThanOrEqual(2);
    const helpfulAdvice = artifact.lexicon.collocations.find(
      (collocation) => collocation.canonicalText === "helpful advice",
    )!;
    const helpfulAdviceMaterialIds = new Set(
      artifact.learning.pedagogicalMaterialTargets
        .filter(
          (target) =>
            target.target.targetKind === "COLLOCATION" &&
            target.target.targetId === helpfulAdvice.id,
        )
        .map((target) => target.materialRevisionId),
    );
    expect(
      artifact.learning.pedagogicalMaterialBlocks.some(
        (block) =>
          helpfulAdviceMaterialIds.has(block.materialRevisionId) &&
          block.blockKind === "TEXT" &&
          block.blockRole === "TRANSLATION" &&
          block.text === "有帮助的建议",
      ),
    ).toBe(true);
    expect(artifact.lexicon.frames.length).toBeGreaterThan(0);
    expect(artifact.lexicon.argumentMappings.length).toBeGreaterThan(0);
    expect(artifact.lexicon.morphology.wordFormations.length).toBeGreaterThan(
      0,
    );
    expect(
      artifact.lexicon.morphology.inflectionGenerations.length,
    ).toBeGreaterThan(0);

    expect(
      artifact.lexicon.headwordRevisions.some(
        (headword) => headword.normalizedText === "runs",
      ),
    ).toBe(false);
    expect(
      artifact.lexicon.formRepresentations.some(
        (representation) => representation.normalizedText === "runs",
      ),
    ).toBe(true);

    const branchHeadword = artifact.lexicon.headwordRevisions.find(
      (headword) => headword.normalizedText === "branch",
    )!;
    const branchEntry = artifact.lexicon.entryRevisions.find(
      (entry) => entry.headwordId === branchHeadword.headwordId,
    )!;
    const branchSenses = artifact.lexicon.senseRevisions.filter(
      (sense) => sense.entryId === branchEntry.entryId,
    );
    expect(branchSenses).toHaveLength(2);
    const branchChild = branchSenses.find(
      (sense) => sense.parentSenseId !== null,
    )!;
    expect(
      branchSenses.some((sense) => sense.senseId === branchChild.parentSenseId),
    ).toBe(true);

    const entryIdFor = (normalizedText: string) => {
      const headword = artifact.lexicon.headwordRevisions.find(
        (candidate) => candidate.normalizedText === normalizedText,
      )!;
      return artifact.lexicon.entryRevisions.find(
        (entry) => entry.headwordId === headword.headwordId,
      )!.entryId;
    };
    const departmentEntryId = entryIdFor("department");
    const departmentAbbreviationEntryId = entryIdFor("dept");
    expect(
      artifact.lexicon.entryRelations.some(
        (relation) =>
          relation.relationType === "ABBREVIATION_OF" &&
          relation.sourceId === departmentAbbreviationEntryId &&
          relation.targetId === departmentEntryId,
      ),
    ).toBe(true);
    const helpfulEntryId = entryIdFor("helpful");
    const unhelpfulEntryId = entryIdFor("unhelpful");
    expect(
      artifact.lexicon.entryRelations.some(
        (relation) =>
          relation.relationType === "DERIVATIONALLY_RELATED" &&
          relation.direction === "SYMMETRIC" &&
          ((relation.sourceId === helpfulEntryId &&
            relation.targetId === unhelpfulEntryId) ||
            (relation.sourceId === unhelpfulEntryId &&
              relation.targetId === helpfulEntryId)),
      ),
    ).toBe(true);

    for (const normalizedText of ["take off", "kick the bucket"]) {
      const entry = artifact.lexicon.entryRevisions.find(
        (candidate) => candidate.entryId === entryIdFor(normalizedText),
      );
      expect(entry?.entryType).toBe("MULTIWORD");
    }
    expect(
      artifact.lexicon.headwordRevisions.some(
        (headword) => headword.normalizedText === "helpful advice",
      ),
    ).toBe(false);
    expect(artifact.lexicon.corpora.collocationObservations).toEqual([]);

    const cafelikeEntryId = entryIdFor("cafélike");
    const cafelikeCanonicalForm = artifact.lexicon.forms.find(
      (form) =>
        form.entryId === cafelikeEntryId && form.formType === "CANONICAL",
    )!;
    const cafelikeRepresentation = artifact.lexicon.formRepresentations.find(
      (representation) => representation.formId === cafelikeCanonicalForm.id,
    )!;
    const cafelikeAnalysis = artifact.lexicon.morphology.analyses.find(
      (analysis) => analysis.formRepresentationId === cafelikeRepresentation.id,
    )!;
    const cafelikeSegments = artifact.lexicon.morphology.segments
      .filter((segment) => segment.analysisId === cafelikeAnalysis.id)
      .sort((left, right) => left.position - right.position);
    expect(cafelikeSegments.map((segment) => segment.surfaceText)).toEqual([
      "café",
      "like",
    ]);
    expect(
      cafelikeSegments.map((segment) => [
        segment.startOffset,
        segment.endOffset,
      ]),
    ).toEqual([
      [0, 4],
      [4, 8],
    ]);

    const preventDefinition = artifact.lexicon.definitions.find(
      (definition) => definition.text === "to stop something from happening",
    )!;
    const mergedProvenance = artifact.provenance.bundles.find(
      (bundle) => bundle.id === preventDefinition.provenanceId,
    )!;
    expect(mergedProvenance.resolverVersion).toBe("source-merge/v1");
    expect(
      artifact.provenance.evidence.filter(
        (evidence) => evidence.provenanceId === mergedProvenance.id,
      ),
    ).toHaveLength(2);

    expect(
      artifact.learning.books.some((book) => book.key === "youdao:cet4"),
    ).toBe(true);
    expect(artifact.learning.bookItems.length).toBeGreaterThan(0);
    expect(artifact.learning.learningObjectives.length).toBeGreaterThan(0);
    expect(artifact.learning.pedagogicalMaterials.length).toBeGreaterThan(0);
    const culturalRevision =
      artifact.learning.pedagogicalMaterialRevisions.find(
        (revision) => revision.materialKind === "CULTURAL_CONTEXT",
      )!;
    expect(culturalRevision).toBeDefined();
    const culturalBlockIds = new Set(
      artifact.learning.pedagogicalMaterialBlocks
        .filter((block) => block.materialRevisionId === culturalRevision.id)
        .map((block) => block.id),
    );
    const culturalCitations =
      artifact.learning.pedagogicalMaterialCitations.filter((citation) =>
        culturalBlockIds.has(citation.materialBlockId),
      );
    expect(culturalCitations).toHaveLength(culturalBlockIds.size);
    expect(
      culturalCitations.every((citation) =>
        artifact.provenance.evidence.some(
          (evidence) =>
            evidence.id === citation.contentEvidenceId &&
            evidence.sourceRecordId !== null,
        ),
      ),
    ).toBe(true);
    expect(
      artifact.learning.pedagogicalMaterialRevisions.some(
        (revision) =>
          revision.materialKind === "MNEMONIC" &&
          artifact.provenance.evidence.some(
            (evidence) =>
              evidence.provenanceId === revision.provenanceId &&
              evidence.sourceRecordId !== null,
          ),
      ),
    ).toBe(true);
    expect(artifact.lexicon.citations).toContainEqual(
      expect.objectContaining({
        workTitle: "College English Test",
        location: "CET4",
        year: 2020,
        examType: "阅读",
        verified: false,
      }),
    );
    expect(
      artifact.sources.records.some(
        (record) =>
          record.sourceKey === "youdao-helpful" &&
          record.rawPayload !== null &&
          typeof record.rawPayload === "object" &&
          !Array.isArray(record.rawPayload) &&
          "exam" in record.rawPayload,
      ),
    ).toBe(true);
    const sourceExercises = artifact.learning.exerciseRevisions.filter(
      (revision) => revision.generatorVersion === "youdao-adapter/v1",
    );
    expect(sourceExercises).toHaveLength(1);
    const sourceExercise = sourceExercises[0]!;
    expect(sourceExercise).toMatchObject({
      exerciseTaskKind: "FORM_MEANING_MAPPING",
      responseKind: "CHOICE",
      responseCardinality: "SINGLE",
      gradingMode: "EXACT",
      validationLevel: "FORMATIVE_VERIFIED",
    });
    const sourceChoices = artifact.learning.exerciseChoices.filter(
      (choice) => choice.exerciseRevisionId === sourceExercise.id,
    );
    const sourceAnswer = artifact.learning.correctResponses.find(
      (response) =>
        response.responseKind === "CHOICE" &&
        response.exerciseRevisionId === sourceExercise.id,
    );
    expect(sourceChoices).toHaveLength(3);
    expect(sourceAnswer?.responseKind).toBe("CHOICE");
    if (!sourceAnswer || sourceAnswer.responseKind !== "CHOICE") {
      throw new Error("Expected a source-backed choice response");
    }
    expect(
      sourceChoices.some((choice) => choice.id === sourceAnswer.choiceId),
    ).toBe(true);
    expect(artifact.learning.exerciseItems.length).toBeGreaterThan(0);
    const selfReportedTextExercises =
      artifact.learning.exerciseRevisions.filter(
        (exercise) =>
          exercise.responseKind === "SHORT_TEXT" &&
          exercise.gradingMode === "SELF_REPORT",
      );
    expect(selfReportedTextExercises.length).toBeGreaterThan(0);
    for (const exercise of selfReportedTextExercises) {
      expect(
        artifact.learning.exerciseResponseConfigs.find(
          (config) => config.exerciseRevisionId === exercise.id,
        ),
      ).toMatchObject({
        responseKind: "SHORT_TEXT",
        capturePolicy: "OPTIONAL",
      });
      expect(
        artifact.learning.exerciseStimulusRefs.some(
          (reference) =>
            reference.exerciseRevisionId === exercise.id &&
            reference.role === "REVEAL",
        ),
      ).toBe(true);
    }
    expect(artifact.learning.assessmentBlueprints).toHaveLength(1);
  }, 90_000);

  it("fills only permitted learner fields through an injected structured AI port", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-compiler-ai-"));
    const manifestPath = await createManifest(root);
    const workRoot = join(root, "work");
    const noAiResult = await compileLexicon({
      manifestPath,
      profile: CompileProfile.FIXTURE,
      outputPath: join(root, "no-ai.json.zst"),
      workRoot,
    });
    const generation = new FakeStructuredGenerationPort(
      (request) => {
        const input = request.input as {
          headword?: string;
          materialKind?: "MNEMONIC" | "MICRO_STORY";
          correctAnswer?: string;
          distractorPool?: string[];
          senses?: Array<{ sourceRecordId: string; sourceSenseKey: string }>;
          relation?: { targetText: string };
          candidates?: Array<{
            sourceRecordId: string;
            sourceSenseKey: string;
          }>;
        };
        switch (request.taskType) {
          case "SENSE_ALIGNMENT":
            return {
              groups: input.senses?.map((sense, index) => ({
                localId: `sense:${index + 1}`,
                members: [
                  {
                    sourceRecordId: sense.sourceRecordId,
                    sourceSenseKey: sense.sourceSenseKey,
                  },
                ],
                reasonCode: "DISTINCT_SOURCE_MEANING",
              })),
            };
          case "RELATION_RESOLUTION": {
            const preferredSourceSenseKey = `${input.relation?.targetText}-adj-1`;
            const target =
              input.candidates?.find(
                (candidate) =>
                  candidate.sourceSenseKey === preferredSourceSenseKey,
              ) ?? input.candidates?.[0];
            return {
              decision: target ? "RESOLVED" : "UNRESOLVED",
              target: target
                ? {
                    sourceRecordId: target.sourceRecordId,
                    sourceSenseKey: target.sourceSenseKey,
                  }
                : null,
              reasonCode: target ? "MEANING_MATCH" : "NO_SUPPORTED_TARGET",
            };
          }
          case "LEARNER_DEFINITION":
            return {
              definition: {
                languageTag: "en",
                text: "A concise evidence-bound meaning.",
              },
              translation: {
                languageTag: "zh-CN",
                text: "基于证据的简明释义。",
              },
            };
          case "EXAMPLE_GENERATION":
            return {
              example: {
                text: `${input.headword} appears in this learner example.`,
                translation: "目标词出现在这个学习例句中。",
              },
            };
          case "COLLOCATION_ENRICHMENT":
            return { collocations: [] };
          case "SYNSEM_FRAME":
            return { frame: null };
          case "PEDAGOGICAL_MATERIAL_GENERATION":
            return input.materialKind === "MICRO_STORY"
              ? {
                  materialKind: "MICRO_STORY",
                  blocks: [
                    {
                      role: "STORY",
                      languageTag: "en",
                      text: "A helpful guide showed us the shortest path home.",
                    },
                    {
                      role: "TRANSLATION",
                      languageTag: "zh-CN",
                      text: "一位乐于助人的向导为我们指出了最短的回家路线。",
                    },
                  ],
                }
              : {
                  materialKind: "MNEMONIC",
                  blocks: [
                    {
                      role: "EXPLANATION",
                      languageTag: "zh-CN",
                      text: "把它联想成愿意伸手提供帮助的特征。",
                    },
                  ],
                };
          case "PEDAGOGICAL_MATERIAL_VERIFICATION":
          case "EXERCISE_VERIFICATION":
            return { verdict: "APPROVED", reasonCodes: [] };
          case "STUDY_HINT":
            return {
              hint: {
                languageTag: "zh-CN",
                text: "想一想某人主动提供协助时表现出的特征。",
              },
            };
          case "EXERCISE_GENERATION": {
            const alternatives = input.distractorPool ?? [];
            return {
              exerciseTaskKind: "FORM_MEANING_MAPPING",
              prompt: "选择与 helpful 对应的含义。",
              choices: [input.correctAnswer, ...alternatives.slice(0, 3)].map(
                (text, index) => ({
                  localId: `choice:${index + 1}`,
                  text,
                  correct: index === 0,
                  distractorKind: index === 0 ? null : "SAME_POS",
                  rationale:
                    index === 0 ? "Matches the source." : "Different Sense.",
                }),
              ),
              correctResponse: input.correctAnswer,
              feedbackCorrect: "回答正确。",
              feedbackIncorrect: "请重新核对目标义项。",
              authoredDifficultyTier: "FOUNDATION",
            };
          }
          default:
            throw new Error(`Unexpected task ${request.taskType}`);
        }
      },
      { provider: "fake", model: "fixture-resolved" },
    );
    const outputPath = join(root, "ai.json.zst");
    const progressEvents: Array<{ stage: string; message?: string }> = [];
    const lexicalCandidates: LexicalCandidatePort = {
      async resolve<T>() {
        return null;
      },
      async submit<T>(candidate: LexicalCandidateSubmission<T>) {
        return {
          disposition: LexicalCandidateDisposition.APPROVED,
          candidateRevisionId: stableId(
            "lexicalCandidateRevision",
            candidate.candidateKey,
          ),
          payload: candidate.payload,
        };
      },
      async finalizeReviewBatch() {
        return { reviewBatchId: null, pendingCount: 0 };
      },
    };
    const aiResult = await compileLexiconInternal(
      {
        manifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath,
        workRoot,
        ai: {
          enabled: true,
          budgetUsd: "1.00",
          concurrency: 4,
          pricing: { inputUsdPerMillion: "1", outputUsdPerMillion: "2" },
          promptVersion: "fixture/v1",
          schemaVersion: "sylis.ai-candidate/1",
          modelPolicyVersion: "fixture/v1",
          requestedProvider: "fake",
          requestedModel: "fixture",
        },
      },
      {
        structuredGeneration: generation,
        candidateCache: new MemoryCandidateCache(),
        lexicalCandidates,
        sourceRecords: {
          async register() {
            return;
          },
        },
        progress: {
          report(event) {
            progressEvents.push(event);
          },
        },
      },
    );
    const artifact = await readArtifact(outputPath);
    expect(aiResult.runId).not.toBe(noAiResult.runId);
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        stage: "SOURCE_RECORDS",
        message: "Reused checksum-verified source records checkpoint.",
      }),
    );
    expect(generation.probeCount).toBe(1);
    expect(artifact.manifest.ai).toEqual({
      enabled: true,
      promptVersion: "fixture/v1",
      candidateSchemaVersion: "sylis.ai-candidate/1",
      modelPolicyVersion: "fixture/v1",
      requestedIdentity: { provider: "fake", model: "fixture" },
      resolvedIdentity: { provider: "fake", model: "fixture-resolved" },
    });
    expect(aiResult.aiMetrics).toMatchObject({
      taskCount: generation.requests.length,
      providerCalls: generation.requests.length,
      cacheHits: 0,
      validationRejects: 0,
    });
    expect(generation.requests.length).toBeGreaterThan(0);
    const taskTypes = new Set(
      generation.requests.map((request) => request.taskType),
    );
    for (const taskType of [
      LexicalCandidateTaskType.SENSE_ALIGNMENT,
      LexicalCandidateTaskType.RELATION_RESOLUTION,
      LexicalCandidateTaskType.LEARNER_DEFINITION,
      LexicalCandidateTaskType.EXAMPLE_GENERATION,
      LexicalCandidateTaskType.COLLOCATION_ENRICHMENT,
      LexicalCandidateTaskType.SYNSEM_FRAME,
      "PEDAGOGICAL_MATERIAL_GENERATION",
      "PEDAGOGICAL_MATERIAL_VERIFICATION",
      "STUDY_HINT",
      "EXERCISE_VERIFICATION",
    ]) {
      expect(
        taskTypes.has(taskType),
        `Missing ${taskType}; received ${[...taskTypes].sort().join(", ")}`,
      ).toBe(true);
    }
    expect(
      artifact.provenance.evidence.some(
        (evidence) => evidence.evidenceKind === "GENERATED",
      ),
    ).toBe(true);
    const relationResolutionProvenanceIds = new Set(
      artifact.provenance.bundles
        .filter(
          (bundle) => bundle.resolverVersion === "relation-resolution-ai/v1",
        )
        .map((bundle) => bundle.id),
    );
    expect(relationResolutionProvenanceIds.size).toBeGreaterThan(0);
    expect(
      artifact.lexicon.senseRelations.some((relation) => {
        if (!relationResolutionProvenanceIds.has(relation.provenanceId)) {
          return false;
        }
        return artifact.lexicon.definitions.some(
          (definition) =>
            definition.senseId === relation.targetId &&
            definition.text === "having a practical use",
        );
      }),
    ).toBe(true);
    expect(
      artifact.learning.pedagogicalMaterialRevisions.some(
        (material) => material.materialKind === "MNEMONIC",
      ),
    ).toBe(true);
    expect(
      artifact.learning.pedagogicalMaterialRevisions.some(
        (material) => material.materialKind === "MICRO_STORY",
      ),
    ).toBe(true);
    const microStoryRevision =
      artifact.learning.pedagogicalMaterialRevisions.find(
        (material) => material.materialKind === "MICRO_STORY",
      )!;
    const materialStimulusBlock = artifact.learning.stimulusBlocks.find(
      (block) =>
        block.blockKind === "MATERIAL" &&
        block.pedagogicalMaterialRevisionId === microStoryRevision.id,
    );
    expect(materialStimulusBlock).toBeDefined();
    expect(
      artifact.learning.exerciseStimulusRefs.some(
        (reference) =>
          reference.stimulusRevisionId ===
            materialStimulusBlock?.stimulusRevisionId &&
          artifact.learning.exerciseRevisions.some(
            (exercise) =>
              exercise.id === reference.exerciseRevisionId &&
              exercise.exerciseTaskKind === "SENTENCE_PRODUCTION",
          ),
      ),
    ).toBe(true);
    expect(artifact.learning.objectiveHints.length).toBeGreaterThan(0);
    expect(
      artifact.lexicon.formRepresentations.every(
        (representation) =>
          representation.representationType !== "PHONETIC" ||
          !representation.provenanceId.includes("generated"),
      ),
    ).toBe(true);
  }, 30_000);

  it("stops an AI build when the structured capability probe fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-compiler-probe-"));
    const manifestPath = await createManifest(root);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.sources[0].uri = join(root, "source-must-not-be-read.csv");
    await writeFile(manifestPath, JSON.stringify(manifest));
    const generation = new FakeStructuredGenerationPort(() => {
      throw new Error("generate should not be called");
    });
    generation.probe = async () => {
      throw new Error("AI_CAPABILITY_PROBE_FAILED");
    };

    await expect(
      compileLexicon(
        {
          manifestPath,
          profile: CompileProfile.FIXTURE,
          outputPath: join(root, "artifact.json.zst"),
          workRoot: join(root, "work"),
          ai: {
            enabled: true,
            budgetUsd: "1.00",
            concurrency: 1,
            pricing: { inputUsdPerMillion: "1", outputUsdPerMillion: "2" },
            promptVersion: "fixture/v1",
            schemaVersion: "sylis.ai-candidate/1",
            modelPolicyVersion: "fixture/v1",
            requestedProvider: "fake",
            requestedModel: "fixture",
          },
        },
        { structuredGeneration: generation },
      ),
    ).rejects.toThrow("AI_CAPABILITY_PROBE_FAILED");
    expect(generation.requests).toHaveLength(0);
  });

  it("rejects a rich target set whose pinned checksum no longer matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-rich-target-checksum-"));
    const manifestPath = await createManifest(root);
    await writeFile(join(root, "rich-targets.json"), "{}\n");

    await expect(
      compileLexicon({
        manifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: join(root, "artifact.json.zst"),
        workRoot: join(root, "work"),
      }),
    ).rejects.toThrow("Rich target set checksum mismatch");
  });

  it("keeps the committed pilot selection and rich targets pinned and representative", async () => {
    expect(await sha256File(pilotHeadwordSetPath)).toBe(
      PILOT_HEADWORD_SET_SHA256,
    );
    expect(await sha256File(pilotRichTargetSetPath)).toBe(
      PILOT_RICH_TARGET_SET_SHA256,
    );
    const pilotSet = parseHeadwordSet(
      JSON.parse(await readFile(pilotHeadwordSetPath, "utf8")),
      "pilot-en-v1",
    );

    expect(pilotSet.headwords).toHaveLength(200);
    const selected = new Set(
      pilotSet.headwords.map(
        ({ languageTag, normalizedHeadword }) =>
          `${languageTag}:${normalizedHeadword}`,
      ),
    );
    expect(selected.size).toBe(200);
    for (const required of [
      "bank",
      "run",
      "break",
      "broken",
      "helpful",
      "prevent",
      "kick the bucket",
      "take off",
    ]) {
      expect(selected).toContain(`en:${required}`);
    }

    const pilotManifest: SourceManifest = {
      manifestVersion: "sylis.source-manifest/1",
      sources: [],
      release: {
        lexiconKey: "sylis-en-zh-pilot",
        releaseVersion: "pilot",
        sourceLanguageTag: "en",
        learningLanguageTags: ["zh-CN"],
        compilerVersion: "1.0.0",
        gitCommit: "0".repeat(40),
      },
      pedagogy: {
        audienceProfileKey: "zh-general-adult-en-v1",
        learningLanguageTag: "en",
        supportLanguageTag: "zh-CN",
        richTargetSet: {
          version: "pilot-rich-en-v1",
          path: basename(pilotRichTargetSetPath),
          sha256: PILOT_RICH_TARGET_SET_SHA256,
        },
      },
    };
    const richTargetSet = await loadRichTargetSet(
      pilotManifest,
      join(dirname(pilotRichTargetSetPath), "pilot.sources.json"),
    );
    expect(richTargetSet?.targets).toEqual([
      expect.objectContaining({
        key: "helpful-adjective-primary",
        headword: "helpful",
        partOfSpeech: "lexinfo:adjective",
        materialKinds: ["MNEMONIC", "MICRO_STORY"],
        generateStudyHint: true,
        generateExercise: true,
      }),
    ]);
    for (const target of richTargetSet?.targets ?? []) {
      expect(selected).toContain(`${target.languageTag}:${target.headword}`);
    }
  });

  it("rejects duplicate, changed and missing headword-set targets", async () => {
    expect(() =>
      parseHeadwordSet(
        {
          headwordSetVersion: "sylis.headword-set/1",
          version: "fixture-1",
          headwords: [{ languageTag: "EN", normalizedHeadword: " run " }],
        },
        "fixture-1",
      ),
    ).toThrow("canonical language tag");
    expect(() =>
      parseHeadwordSet(
        {
          headwordSetVersion: "sylis.headword-set/1",
          version: "fixture-1",
          headwords: [{ languageTag: "en", normalizedHeadword: " run " }],
        },
        "fixture-1",
      ),
    ).toThrow("Headword selector must already be normalized");
    expect(() =>
      parseHeadwordSet(
        {
          headwordSetVersion: "sylis.headword-set/1",
          version: "fixture-1",
          headwords: [{ languageTag: "en", normalizedHeadword: "run" }],
        },
        "fixture-2",
      ),
    ).toThrow("Headword set metadata is invalid");

    const duplicateRoot = await mkdtemp(
      join(tmpdir(), "sylis-headword-duplicate-"),
    );
    const duplicateManifestPath = await createManifest(duplicateRoot, {
      headwords: [
        { languageTag: "en", normalizedHeadword: "run" },
        { languageTag: "en", normalizedHeadword: "run" },
      ],
    });
    const duplicateManifest = parseSourceManifest(
      JSON.parse(await readFile(duplicateManifestPath, "utf8")),
    );
    await expect(
      loadHeadwordSet(duplicateManifest, duplicateManifestPath),
    ).rejects.toThrow("Duplicate headword selector en:run");

    const changedRoot = await mkdtemp(
      join(tmpdir(), "sylis-headword-checksum-"),
    );
    const changedManifestPath = await createManifest(changedRoot, {
      headwords: FIXTURE_PUBLISHED_HEADWORDS,
    });
    await writeFile(join(changedRoot, "headwords.json"), "{}\n");
    await expect(
      compileLexicon({
        manifestPath: changedManifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: join(changedRoot, "artifact.json.zst"),
        workRoot: join(changedRoot, "work"),
      }),
    ).rejects.toThrow("Headword set checksum mismatch");

    const missingRoot = await mkdtemp(
      join(tmpdir(), "sylis-headword-missing-"),
    );
    const missingManifestPath = await createManifest(missingRoot, {
      headwords: [
        ...FIXTURE_PUBLISHED_HEADWORDS,
        { languageTag: "en", normalizedHeadword: "missing-headword" },
      ],
    });
    await expect(
      compileLexicon({
        manifestPath: missingManifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: join(missingRoot, "artifact.json.zst"),
        workRoot: join(missingRoot, "work"),
      }),
    ).rejects.toThrow(
      "HEADWORD_SET_TARGETS_MISSING:count=1:targets=en:missing-headword",
    );
  });

  it("selects the same complete source evidence regardless of source order", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "sylis-selection-first-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "sylis-selection-second-"));
    const firstManifestPath = await createManifest(firstRoot, {
      headwords: FIXTURE_PUBLISHED_HEADWORDS,
    });
    const secondManifestPath = await createManifest(secondRoot, {
      headwords: FIXTURE_PUBLISHED_HEADWORDS,
      reverseSources: true,
    });
    const firstOutput = join(firstRoot, "artifact.json.zst");
    const secondOutput = join(secondRoot, "artifact.json.zst");

    const first = await compileLexicon({
      manifestPath: firstManifestPath,
      profile: CompileProfile.FIXTURE,
      outputPath: firstOutput,
      workRoot: join(firstRoot, "work"),
    });
    const second = await compileLexicon({
      manifestPath: secondManifestPath,
      profile: CompileProfile.FIXTURE,
      outputPath: secondOutput,
      workRoot: join(secondRoot, "work"),
    });

    expect(first.headwordCount).toBe(FIXTURE_PUBLISHED_HEADWORDS.length);
    expect(first.contentHash).toBe(second.contentHash);
    expect(await readFile(firstOutput)).toEqual(await readFile(secondOutput));
  }, 30_000);

  it("binds environment-provided source bytes to checkpoint identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-source-identity-"));
    const manifestPath = await createManifest(root);
    const manifestDocument = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as {
      sources: Array<Record<string, unknown>>;
    };
    const ecdictSource = manifestDocument.sources[0]!;
    delete ecdictSource.uri;
    delete ecdictSource.sha256;
    ecdictSource.pathEnv = "TEST_ECDICT_PATH";
    ecdictSource.sha256Env = "TEST_ECDICT_SHA256";
    await writeFile(manifestPath, JSON.stringify(manifestDocument));

    const firstSourcePath = join(root, "ecdict-first.csv");
    const secondSourcePath = join(root, "ecdict-second.csv");
    const fixtureSource = await readFile(
      join(fixtureRoot, "ecdict.csv"),
      "utf8",
    );
    await writeFile(firstSourcePath, fixtureSource);
    await writeFile(
      secondSourcePath,
      `${fixtureSource}identity-test,,n. a test identity,n. 测试身份,n,,\n`,
    );
    const workRoot = join(root, "work");
    const first = await compileLexiconInternal(
      {
        manifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: join(root, "first.json.zst"),
        workRoot,
      },
      {
        env: {
          TEST_ECDICT_PATH: firstSourcePath,
          TEST_ECDICT_SHA256: await sha256File(firstSourcePath),
        },
      },
    );
    const second = await compileLexiconInternal(
      {
        manifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: join(root, "second.json.zst"),
        workRoot,
      },
      {
        env: {
          TEST_ECDICT_PATH: secondSourcePath,
          TEST_ECDICT_SHA256: await sha256File(secondSourcePath),
        },
      },
    );

    expect(first.runId).not.toBe(second.runId);
    expect(first.contentHash).not.toBe(second.contentHash);
  });

  it("binds a materialized source to its parent, selection and record count", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-materialization-"));
    const manifestPath = await createManifest(root, {
      headwords: FIXTURE_PUBLISHED_HEADWORDS,
    });
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      selection: { headwordSet: { sha256: string } };
      sources: Array<{
        homepageUri: string;
        sha256: string;
        materialization?: {
          parentUri: string;
          parentSha256: string;
          selectionSha256: string;
          materializerVersion: string;
          recordCount: number;
        };
      }>;
    };
    manifest.sources[0]!.materialization = {
      parentUri: manifest.sources[0]!.homepageUri,
      parentSha256: manifest.sources[0]!.sha256,
      selectionSha256: manifest.selection.headwordSet.sha256,
      materializerVersion: "fixture-headword-slice/v1",
      recordCount: 7,
    };
    await writeFile(manifestPath, JSON.stringify(manifest));

    const result = await compileLexicon({
      manifestPath,
      profile: CompileProfile.FIXTURE,
      outputPath: join(root, "materialized.json.zst"),
      workRoot: join(root, "work"),
    });
    expect(result.artifactManifest.inputs.sources[0]!.materialization).toEqual({
      parentUri: manifest.sources[0]!.homepageUri,
      parentChecksum: `sha256:${manifest.sources[0]!.sha256}`,
      selectionChecksum: `sha256:${manifest.selection.headwordSet.sha256}`,
      materializerVersion: "fixture-headword-slice/v1",
      recordCount: 7,
    });

    manifest.sources[0]!.materialization.recordCount = 8;
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(
      compileLexicon({
        manifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: join(root, "wrong-count.json.zst"),
        workRoot: join(root, "work"),
      }),
    ).rejects.toThrow("SOURCE_MATERIALIZATION_RECORD_COUNT_MISMATCH");
  });

  it("requires exact profile counts and keeps rich targets inside selection", async () => {
    const countRoot = await mkdtemp(join(tmpdir(), "sylis-pilot-count-"));
    const countManifestPath = await createManifest(countRoot, {
      headwords: FIXTURE_PUBLISHED_HEADWORDS,
    });
    await expect(
      compileLexicon({
        manifestPath: countManifestPath,
        profile: CompileProfile.PILOT_200,
        outputPath: join(countRoot, "artifact.json.zst"),
        workRoot: join(countRoot, "work"),
      }),
    ).rejects.toThrow(
      "HEADWORD_SET_COUNT_MISMATCH:profile=pilot-200:expected=200:actual=15",
    );

    const subsetRoot = await mkdtemp(join(tmpdir(), "sylis-rich-subset-"));
    const subsetManifestPath = await createManifest(subsetRoot, {
      headwords: [{ languageTag: "en", normalizedHeadword: "run" }],
    });
    await expect(
      compileLexicon({
        manifestPath: subsetManifestPath,
        profile: CompileProfile.FIXTURE,
        outputPath: join(subsetRoot, "artifact.json.zst"),
        workRoot: join(subsetRoot, "work"),
      }),
    ).rejects.toThrow("RICH_TARGET_NOT_SELECTED:en:helpful");
  });

  it("rejects source rights that cannot produce a public artifact", async () => {
    for (const [flag, expected] of [
      ["mayBuild", "SOURCE_RIGHTS_BUILD_FORBIDDEN"],
      ["mayServe", "SOURCE_RIGHTS_SERVE_FORBIDDEN"],
      ["mayExport", "SOURCE_RIGHTS_EXPORT_FORBIDDEN"],
    ] as const) {
      const root = await mkdtemp(join(tmpdir(), `sylis-rights-${flag}-`));
      const rights = {
        mayBuild: true,
        mayServe: true,
        mayExport: true,
        requiresAttribution: false,
      };
      rights[flag] = false;
      const manifestPath = await createManifest(root, { rights });
      await expect(
        compileLexicon({
          manifestPath,
          profile: CompileProfile.FIXTURE,
          outputPath: join(root, "artifact.json.zst"),
          workRoot: join(root, "work"),
        }),
      ).rejects.toThrow(expected);
    }

    const attributionRoot = await mkdtemp(
      join(tmpdir(), "sylis-rights-attribution-"),
    );
    const attributionManifestPath = await createManifest(attributionRoot, {
      rights: {
        mayBuild: true,
        mayServe: true,
        mayExport: true,
        requiresAttribution: true,
      },
    });
    const attributionManifestSource = await readFile(
      attributionManifestPath,
      "utf8",
    );
    expect(() =>
      parseSourceManifest(JSON.parse(attributionManifestSource)),
    ).toThrow("Source ecdict attribution is required");
  });

  it("rejects failed learning verification and generates only when reuse is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-learning-enrichment-"));
    const manifestPath = await createManifest(root);
    const outputPath = join(root, "base.json.zst");
    await compileLexicon({
      manifestPath,
      profile: CompileProfile.FIXTURE,
      outputPath,
      workRoot: join(root, "work"),
    });
    const manifest = parseSourceManifest(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    const artifact = await readArtifact(outputPath);
    const targetDefinition = artifact.lexicon.definitions.find(
      (definition) => definition.text === "giving useful help",
    );
    if (!targetDefinition) throw new Error("Helpful fixture Sense is missing.");
    const objectiveRevisionId = artifact.learning.objectiveSubjects.find(
      (subject) =>
        subject.subjectRole === "PRIMARY" &&
        subject.target.targetKind === "SENSE" &&
        subject.target.targetId === targetDefinition.senseId &&
        artifact.learning.objectiveRevisions.some(
          (revision) =>
            revision.id === subject.learningObjectiveRevisionId &&
            revision.knowledgeFacet === "MEANING_FORM_MEANING" &&
            revision.retrievalDirection === "RECEPTIVE",
        ),
    )?.learningObjectiveRevisionId;
    if (!objectiveRevisionId) {
      throw new Error("Helpful fixture learning Objective is missing.");
    }
    const baseTarget = {
      key: "helpful-primary",
      languageTag: "en",
      headword: "helpful",
      partOfSpeech: "lexinfo:adjective",
      senseDefinitionContains: "giving useful help",
      materialKinds: [] as PedagogicalMaterialKind[],
      generateStudyHint: false,
      generateExercise: false,
    };
    const targetSet = (target: typeof baseTarget): RichTargetSet => ({
      targetSetVersion: "sylis.rich-target-set/1",
      version: "fixture-1",
      targets: [target],
    });

    const materialGeneration = new FakeStructuredGenerationPort((request) =>
      learningResponse(request, "PEDAGOGICAL_MATERIAL_VERIFICATION"),
    );
    await expect(
      enrichLearningContent(
        structuredClone(artifact),
        manifest,
        targetSet({
          ...baseTarget,
          materialKinds: [PedagogicalMaterialKind.MNEMONIC],
        }),
        createLearningExecutor(materialGeneration),
        silentProgress,
      ),
    ).rejects.toThrow("AI_MATERIAL_REJECTED");

    const exerciseVerification = new FakeStructuredGenerationPort((request) =>
      learningResponse(request, "EXERCISE_VERIFICATION"),
    );
    await expect(
      enrichLearningContent(
        structuredClone(artifact),
        manifest,
        targetSet({ ...baseTarget, generateExercise: true }),
        createLearningExecutor(exerciseVerification),
        silentProgress,
      ),
    ).rejects.toThrow("AI_EXERCISE_REJECTED");

    const generatedArtifact = structuredClone(artifact);
    generatedArtifact.learning.exerciseRevisions =
      generatedArtifact.learning.exerciseRevisions.filter(
        (revision) =>
          revision.learningObjectiveRevisionId !== objectiveRevisionId,
      );
    const exerciseGeneration = new FakeStructuredGenerationPort((request) =>
      learningResponse(request),
    );
    await enrichLearningContent(
      generatedArtifact,
      manifest,
      targetSet({ ...baseTarget, generateExercise: true }),
      createLearningExecutor(exerciseGeneration),
      silentProgress,
    );
    expect(
      exerciseGeneration.requests.some(
        (request) => request.taskType === "EXERCISE_GENERATION",
      ),
    ).toBe(true);
    expect(
      generatedArtifact.learning.exerciseRevisions.some(
        (revision) =>
          revision.learningObjectiveRevisionId === objectiveRevisionId &&
          revision.generatorVersion === "structured-ai/v1",
      ),
    ).toBe(true);
  }, 15_000);
});
