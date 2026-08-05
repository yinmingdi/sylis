import type {
  StructuredGenerationIdentity,
  StructuredGenerationPort,
} from "@sylis/ai-provider";
import {
  type ArtifactManifest,
  type SylisLexiconArtifactV1,
  updateManifestCounts,
  validateArtifact,
} from "@sylis/lexicon-contracts";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { NormalizedSourceRecord } from "./candidates/candidate-v1";
import {
  createEncryptedCandidateCacheFromEnv,
  type CandidateCache,
} from "./enrich/candidate-cache";
import { enrichArtifactFacts } from "./enrich/fact-enricher";
import { enrichLearningContent } from "./enrich/learning-enricher";
import { resolveAmbiguousRelations } from "./enrich/relation-resolver";
import { alignAmbiguousSourceSenses } from "./enrich/sense-aligner";
import { enrichArtifactDefinitions } from "./enrich/structured-enricher";
import {
  type StructuredEnrichmentOptions,
  type StructuredTaskMetrics,
  StructuredTaskExecutor,
} from "./enrich/structured-task-executor";
import {
  writeArtifact,
  type ArtifactWriteResult,
} from "./export/artifact-writer";
import {
  headwordSelectorKey,
  loadHeadwordSet,
  loadRichTargetSet,
  parseSourceManifest,
  resolveManifestSources,
  type HeadwordSet,
  type ResolvedSource,
  type SourceManifest,
} from "./manifest/source-manifest";
import { readCheckpoint, writeCheckpoint } from "./progress/checkpoint";
import { type CompileProgressPort, silentProgress } from "./progress/reporter";
import { buildArtifact } from "./resolve/artifact-builder";
import { buildLearningContent } from "./resolve/learning-content";
import { readSource } from "./sources/index";
import { validateLinguistics } from "./validate/linguistics";
import { evaluateContentProfiles } from "./validate/profiles";
import { assertPublicArtifactSourceRights } from "./validate/source-rights";
import { populateExerciseStatistics } from "./validate/statistics";
import { createValidationSummary } from "./validate/validation-summary";

export type CompileProfile = "fixture" | "pilot-200" | "core-20000";

export interface CompileOptions {
  manifestPath: string;
  profile: CompileProfile;
  outputPath: string;
  workRoot?: string;
  resumeRunId?: string;
  ai?: StructuredEnrichmentOptions;
}

export interface CompileDependencies {
  structuredGeneration?: StructuredGenerationPort;
  progress?: CompileProgressPort;
}

interface CompileInternalDependencies extends CompileDependencies {
  env?: NodeJS.ProcessEnv;
  candidateCache?: CandidateCache;
}

export interface CompileResult extends ArtifactWriteResult {
  runId: string;
  sourceRecordCount: number;
  headwordCount: number;
  aiMetrics: StructuredTaskMetrics | null;
  artifactManifest: ArtifactManifest;
}

const PROFILE_HEADWORD_COUNTS: Record<CompileProfile, number | null> = {
  fixture: null,
  "pilot-200": 200,
  "core-20000": 20_000,
};

const CHECKPOINT_HANDLER_VERSIONS = {
  SOURCE_RECORDS: "source-records/v6",
  RELATION_RESOLUTION: "relation-resolution/v2",
  LEARNING_CONTENT: "learning-content/v3",
} as const;

function headwordSetInput(
  manifest: SourceManifest,
  headwordSet: HeadwordSet | null,
): {
  version: string;
  sha256: string;
  identities: string[];
} | null {
  if (!headwordSet) return null;
  return {
    version: manifest.selection!.headwordSet.version,
    sha256: manifest
      .selection!.headwordSet.sha256.replace(/^sha256:/, "")
      .toLowerCase(),
    identities: headwordSet.headwords.map(headwordSelectorKey).sort(),
  };
}

function sourceRecordsInputHash(
  manifest: SourceManifest,
  headwordSet: HeadwordSet | null,
  sources: ResolvedSource[],
  profile: CompileProfile,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        profile,
        headwordSet: headwordSetInput(manifest, headwordSet),
        sources: sources
          .map((source) => ({
            key: source.key,
            version: source.version,
            adapter: source.adapter,
            checksum: source.checksum,
            sourceUri: source.sourceUri,
            materialization: source.materialization ?? null,
          }))
          .sort((left, right) =>
            left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
          ),
        codeVersion: manifest.release.gitCommit,
        compilerVersion: manifest.release.compilerVersion,
        schemaVersion: "sylis.lexicon-artifact/1",
        handlerVersion: CHECKPOINT_HANDLER_VERSIONS.SOURCE_RECORDS,
      }),
    )
    .digest("hex");
}

function runInputHash(
  manifestSource: string,
  manifest: SourceManifest,
  headwordSet: HeadwordSet | null,
  sources: ResolvedSource[],
  profile: CompileProfile,
  ai: CompileOptions["ai"],
  resolvedAiIdentity: StructuredGenerationIdentity | null,
): string {
  return createHash("sha256")
    .update(manifestSource)
    .update(profile)
    .update(JSON.stringify(headwordSetInput(manifest, headwordSet)))
    .update(
      JSON.stringify(
        ai?.enabled
          ? {
              enabled: true,
              budgetUsd: ai.budgetUsd,
              concurrency: ai.concurrency,
              pricing: ai.pricing,
              promptVersion: ai.promptVersion,
              schemaVersion: ai.schemaVersion,
              modelPolicyVersion: ai.modelPolicyVersion,
              requestedProvider: ai.requestedProvider,
              requestedModel: ai.requestedModel,
              resolvedIdentity: resolvedAiIdentity,
            }
          : { enabled: false },
      ),
    )
    .update(
      JSON.stringify(
        sources
          .map((source) => ({
            key: source.key,
            version: source.version,
            checksum: source.checksum,
          }))
          .sort((left, right) =>
            left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
          ),
      ),
    )
    .digest("hex");
}

function assertCheckpointCompatible(
  checkpoint: Awaited<ReturnType<typeof readCheckpoint>>,
  expected: {
    runId: string;
    inputHash: string;
    codeVersion: string;
    compilerVersion: string;
    stage: "SOURCE_RECORDS" | "RELATION_RESOLUTION" | "LEARNING_CONTENT";
    handlerVersion: string;
  },
): asserts checkpoint is NonNullable<
  Awaited<ReturnType<typeof readCheckpoint>>
> {
  if (!checkpoint) throw new Error(`CHECKPOINT_MISSING:${expected.stage}`);
  if (
    checkpoint.runId !== expected.runId ||
    checkpoint.inputHash !== expected.inputHash ||
    checkpoint.codeVersion !== expected.codeVersion ||
    checkpoint.compilerVersion !== expected.compilerVersion ||
    checkpoint.schemaVersion !== "sylis.lexicon-artifact/1" ||
    checkpoint.stage !== expected.stage ||
    checkpoint.handlerVersion !== expected.handlerVersion
  ) {
    throw new Error(`CHECKPOINT_INPUT_MISMATCH:${expected.stage}`);
  }
}

async function collectRecords(
  sources: Awaited<ReturnType<typeof resolveManifestSources>>,
  headwordSet: HeadwordSet | null,
  progress: CompileProgressPort,
): Promise<NormalizedSourceRecord[]> {
  const records: NormalizedSourceRecord[] = [];
  const selectedHeadwords = headwordSet
    ? new Set(headwordSet.headwords.map(headwordSelectorKey))
    : null;
  const foundHeadwords = new Set<string>();

  for (const [sourceIndex, source] of sources.entries()) {
    let processed = 0;
    for await (const record of readSource(source)) {
      processed += 1;
      const identity = headwordSelectorKey(record);
      if (!selectedHeadwords || selectedHeadwords.has(identity)) {
        foundHeadwords.add(identity);
        records.push(record);
      }
      if (processed % 1_000 === 0) {
        await progress.report({
          stage: "SOURCE_RECORDS",
          processed,
          total: null,
          message: `${source.key} (${sourceIndex + 1}/${sources.length})`,
        });
      }
    }
    if (
      source.materialization &&
      processed !== source.materialization.recordCount
    ) {
      throw new Error(
        `SOURCE_MATERIALIZATION_RECORD_COUNT_MISMATCH:source=${source.key}:expected=${source.materialization.recordCount}:actual=${processed}`,
      );
    }
  }
  if (selectedHeadwords) {
    const missing = [...selectedHeadwords]
      .filter((identity) => !foundHeadwords.has(identity))
      .sort();
    if (missing.length > 0) {
      throw new Error(
        `HEADWORD_SET_TARGETS_MISSING:count=${missing.length}:targets=${missing.slice(0, 20).join(",")}`,
      );
    }
  }
  return records;
}

function assertRichTargetsSelected(
  headwordSet: HeadwordSet | null,
  richTargetSet: Awaited<ReturnType<typeof loadRichTargetSet>>,
): void {
  if (!headwordSet || !richTargetSet) return;
  const selected = new Set(headwordSet.headwords.map(headwordSelectorKey));
  const missing = richTargetSet.targets
    .map((target) =>
      headwordSelectorKey({
        languageTag: target.languageTag,
        normalizedHeadword: normalizeTargetHeadword(target.headword),
      }),
    )
    .filter((identity) => !selected.has(identity))
    .sort();
  if (missing.length > 0) {
    throw new Error(`RICH_TARGET_NOT_SELECTED:${missing.join(",")}`);
  }
}

function normalizeTargetHeadword(headword: string): string {
  return headword.trim().normalize("NFC").replace(/\s+/g, " ");
}

function assertSelectedHeadwordsPublished(
  artifact: SylisLexiconArtifactV1,
  headwordSet: HeadwordSet | null,
): void {
  if (!headwordSet) return;
  const published = new Set(
    artifact.lexicon.headwords.map((headword) => headword.identityKey),
  );
  const missing = headwordSet.headwords
    .map(headwordSelectorKey)
    .filter((identity) => !published.has(identity))
    .sort();
  if (missing.length > 0) {
    throw new Error(
      `HEADWORD_SET_TARGETS_NOT_PUBLISHED:count=${missing.length}:targets=${missing.slice(0, 20).join(",")}`,
    );
  }
}

export async function compileLexicon(
  options: CompileOptions,
  dependencies: CompileDependencies = {},
): Promise<CompileResult> {
  return compileLexiconInternal(options, dependencies);
}

export async function compileLexiconInternal(
  options: CompileOptions,
  dependencies: CompileInternalDependencies = {},
): Promise<CompileResult> {
  const progress = dependencies.progress ?? silentProgress;
  await progress.report({ stage: "PREFLIGHT", processed: 0, total: null });
  if (options.ai?.enabled && !dependencies.structuredGeneration) {
    throw new Error("AI is enabled but StructuredGenerationPort is missing.");
  }
  if (
    options.ai?.enabled &&
    (!options.ai.requestedProvider || !options.ai.requestedModel)
  ) {
    throw new Error("AI requested provider and model are required.");
  }

  const manifestPath = resolve(options.manifestPath);
  const manifestSource = await readFile(manifestPath, "utf8");
  const manifest = parseSourceManifest(JSON.parse(manifestSource));
  assertPublicArtifactSourceRights(
    manifest.sources.map((source) => ({ key: source.key, ...source.rights })),
  );
  const headwordSet = await loadHeadwordSet(manifest, manifestPath);
  const richTargetSet = await loadRichTargetSet(manifest, manifestPath);
  const expectedHeadwordCount = PROFILE_HEADWORD_COUNTS[options.profile];
  if (expectedHeadwordCount !== null && !headwordSet) {
    throw new Error(
      `${options.profile} requires a checksum-pinned headword set.`,
    );
  }
  if (
    headwordSet &&
    expectedHeadwordCount !== null &&
    headwordSet.headwords.length !== expectedHeadwordCount
  ) {
    throw new Error(
      `HEADWORD_SET_COUNT_MISMATCH:profile=${options.profile}:expected=${expectedHeadwordCount}:actual=${headwordSet.headwords.length}`,
    );
  }
  if (options.profile !== "fixture" && !richTargetSet) {
    throw new Error(
      `${options.profile} requires a checksum-pinned rich target set.`,
    );
  }
  assertRichTargetsSelected(headwordSet, richTargetSet);
  const workRoot = resolve(options.workRoot ?? ".work/lexicon-compiler");
  let resolvedAiIdentity: StructuredGenerationIdentity | null = null;
  if (options.ai?.enabled) {
    resolvedAiIdentity = await dependencies.structuredGeneration!.probe();
    if (
      !resolvedAiIdentity.provider ||
      !resolvedAiIdentity.model ||
      resolvedAiIdentity.provider !== options.ai.requestedProvider
    ) {
      throw new Error(
        `AI_MODEL_IDENTITY_INVALID:requested=${options.ai.requestedProvider}/${options.ai.requestedModel}:resolved=${resolvedAiIdentity.provider}/${resolvedAiIdentity.model}`,
      );
    }
    await progress.report({
      stage: "PREFLIGHT",
      processed: 1,
      total: 1,
      message: "Structured generation capability verified.",
    });
  }
  const sources = await resolveManifestSources(
    manifest,
    manifestPath,
    workRoot,
    dependencies.env,
  );
  const sourceHash = sourceRecordsInputHash(
    manifest,
    headwordSet,
    sources,
    options.profile,
  );
  const hash = runInputHash(
    manifestSource,
    manifest,
    headwordSet,
    sources,
    options.profile,
    options.ai,
    resolvedAiIdentity,
  );
  const runId = options.resumeRunId ?? hash.slice(0, 16);
  const runRoot = resolve(workRoot, runId);
  const sourceCheckpointPath = resolve(
    workRoot,
    "source-records",
    `${sourceHash}.checkpoint.json`,
  );
  const relationCheckpointPath = resolve(
    runRoot,
    "relation-resolution.checkpoint.json",
  );
  const learningCheckpointPath = resolve(
    runRoot,
    "learning-content.checkpoint.json",
  );
  const runCheckpointIdentity = {
    runId,
    inputHash: hash,
    codeVersion: manifest.release.gitCommit,
    compilerVersion: manifest.release.compilerVersion,
  };
  const sourceCheckpointIdentity = {
    runId: sourceHash.slice(0, 16),
    inputHash: sourceHash,
    codeVersion: manifest.release.gitCommit,
    compilerVersion: manifest.release.compilerVersion,
  };
  const artifactAi: ArtifactManifest["ai"] =
    options.ai?.enabled && resolvedAiIdentity
      ? {
          enabled: true,
          promptVersion: options.ai.promptVersion,
          candidateSchemaVersion: options.ai.schemaVersion,
          modelPolicyVersion: options.ai.modelPolicyVersion,
          requestedIdentity: {
            provider: options.ai.requestedProvider,
            model: options.ai.requestedModel,
          },
          resolvedIdentity: resolvedAiIdentity,
        }
      : {
          enabled: false,
          promptVersion: null,
          candidateSchemaVersion: null,
          modelPolicyVersion: null,
          requestedIdentity: null,
          resolvedIdentity: null,
        };

  let executor: StructuredTaskExecutor | undefined;
  const createExecutor = (): StructuredTaskExecutor | undefined => {
    if (!options.ai?.enabled) return undefined;
    if (executor) return executor;
    const cache =
      dependencies.candidateCache ??
      createEncryptedCandidateCacheFromEnv(
        resolve(runRoot, "ai-candidates.enc.json"),
        dependencies.env,
      );
    executor = new StructuredTaskExecutor(options.ai, {
      generation: dependencies.structuredGeneration!,
      resolvedIdentity: resolvedAiIdentity!,
      cache,
    });
    return executor;
  };

  const resumedLearningCheckpoint = options.resumeRunId
    ? await readCheckpoint(learningCheckpointPath)
    : null;
  let artifact: SylisLexiconArtifactV1;
  if (resumedLearningCheckpoint) {
    assertCheckpointCompatible(resumedLearningCheckpoint, {
      ...runCheckpointIdentity,
      stage: "LEARNING_CONTENT",
      handlerVersion: CHECKPOINT_HANDLER_VERSIONS.LEARNING_CONTENT,
    });
    if (resumedLearningCheckpoint.stage !== "LEARNING_CONTENT") {
      throw new Error("CHECKPOINT_INPUT_MISMATCH:LEARNING_CONTENT");
    }
    artifact = resumedLearningCheckpoint.artifact;
  } else {
    const resumedRelationCheckpoint = options.resumeRunId
      ? await readCheckpoint(relationCheckpointPath)
      : null;
    let records: NormalizedSourceRecord[];
    if (resumedRelationCheckpoint) {
      assertCheckpointCompatible(resumedRelationCheckpoint, {
        ...runCheckpointIdentity,
        stage: "RELATION_RESOLUTION",
        handlerVersion: CHECKPOINT_HANDLER_VERSIONS.RELATION_RESOLUTION,
      });
      if (resumedRelationCheckpoint.stage !== "RELATION_RESOLUTION") {
        throw new Error("CHECKPOINT_INPUT_MISMATCH:RELATION_RESOLUTION");
      }
      records = resumedRelationCheckpoint.records;
    } else {
      const existingSourceCheckpoint =
        await readCheckpoint(sourceCheckpointPath);
      if (existingSourceCheckpoint) {
        assertCheckpointCompatible(existingSourceCheckpoint, {
          ...sourceCheckpointIdentity,
          stage: "SOURCE_RECORDS",
          handlerVersion: CHECKPOINT_HANDLER_VERSIONS.SOURCE_RECORDS,
        });
        if (existingSourceCheckpoint.stage !== "SOURCE_RECORDS") {
          throw new Error("CHECKPOINT_INPUT_MISMATCH:SOURCE_RECORDS");
        }
        records = existingSourceCheckpoint.records;
        await progress.report({
          stage: "SOURCE_RECORDS",
          processed: records.length,
          total: records.length,
          message: "Reused checksum-verified source records checkpoint.",
        });
      } else {
        records = await collectRecords(sources, headwordSet, progress);
        await writeCheckpoint(sourceCheckpointPath, {
          checkpointVersion: "sylis.lexicon-checkpoint/2",
          ...sourceCheckpointIdentity,
          schemaVersion: "sylis.lexicon-artifact/1",
          handlerVersion: CHECKPOINT_HANDLER_VERSIONS.SOURCE_RECORDS,
          stage: "SOURCE_RECORDS",
          records,
        });
      }
      const activeExecutor = createExecutor();
      if (activeExecutor) {
        await alignAmbiguousSourceSenses(records, activeExecutor, progress);
      }
      await resolveAmbiguousRelations(records, activeExecutor, progress);
      await writeCheckpoint(relationCheckpointPath, {
        checkpointVersion: "sylis.lexicon-checkpoint/2",
        ...runCheckpointIdentity,
        schemaVersion: "sylis.lexicon-artifact/1",
        handlerVersion: CHECKPOINT_HANDLER_VERSIONS.RELATION_RESOLUTION,
        stage: "RELATION_RESOLUTION",
        records,
      });
    }

    await progress.report({
      stage: "HEADWORD_RESOLUTION",
      processed: records.length,
      total: records.length,
    });
    artifact = buildArtifact(manifest, sources, records, {
      compileProfile: options.profile,
      headwordSet,
      richTargetSet,
      ai: artifactAi,
    });
    await progress.report({
      stage: "MORPH_SYNSEM_ETYMOLOGY",
      processed: records.length,
      total: records.length,
    });
    const activeExecutor = createExecutor();
    if (activeExecutor) {
      await enrichArtifactDefinitions(artifact, activeExecutor, progress);
      await enrichArtifactFacts(artifact, activeExecutor, progress);
    }
    await progress.report({
      stage: "OBJECTIVE_PLANNING",
      processed: 0,
      total: 1,
    });
    buildLearningContent(artifact, records);
    await progress.report({
      stage: "OBJECTIVE_PLANNING",
      processed: 1,
      total: 1,
      message: `${artifact.learning.learningObjectives.length} objectives`,
    });
    if (activeExecutor && richTargetSet) {
      await enrichLearningContent(
        artifact,
        manifest,
        richTargetSet,
        activeExecutor,
        progress,
      );
    }
    await progress.report({
      stage: "PEDAGOGICAL_MATERIALS",
      processed: artifact.learning.pedagogicalMaterialRevisions.length,
      total: artifact.learning.pedagogicalMaterialRevisions.length,
    });
    await progress.report({
      stage: "EXERCISES_BLUEPRINTS",
      processed: artifact.learning.exerciseRevisions.length,
      total: artifact.learning.exerciseRevisions.length,
      message: `${artifact.learning.assessmentBlueprintRevisions.length} blueprints`,
    });
    await writeCheckpoint(learningCheckpointPath, {
      checkpointVersion: "sylis.lexicon-checkpoint/2",
      ...runCheckpointIdentity,
      schemaVersion: "sylis.lexicon-artifact/1",
      handlerVersion: CHECKPOINT_HANDLER_VERSIONS.LEARNING_CONTENT,
      stage: "LEARNING_CONTENT",
      artifact,
    });
  }

  assertSelectedHeadwordsPublished(artifact, headwordSet);
  if (
    options.profile === "pilot-200" &&
    artifact.lexicon.headwords.length !== 200
  ) {
    throw new Error(
      `PILOT_PUBLISHED_HEADWORD_COUNT_MISMATCH:expected=200:actual=${artifact.lexicon.headwords.length}`,
    );
  }
  Object.assign(artifact.quality, evaluateContentProfiles(artifact));
  populateExerciseStatistics(artifact);
  updateManifestCounts(artifact);
  await progress.report({
    stage: "GLOBAL_VALIDATION",
    processed: 0,
    total: 1,
  });
  const linguisticIssues = validateLinguistics(artifact);
  const report = validateArtifact(artifact);
  artifact.quality.validationSummary = createValidationSummary([
    ...report.issues,
    ...linguisticIssues.map(() => ({ severity: "ERROR" as const })),
  ]);
  if (linguisticIssues.length > 0) {
    throw new Error(
      `LINGUISTIC_INVALID:${linguisticIssues
        .slice(0, 10)
        .map((issue) => `${issue.code}:${issue.entityId ?? "artifact"}`)
        .join(",")}`,
    );
  }
  if (!report.valid) {
    throw new Error(
      `ARTIFACT_INVALID:${report.issues
        .slice(0, 10)
        .map((issue) => `${issue.code}:${issue.path}`)
        .join(",")}`,
    );
  }
  await progress.report({ stage: "EXPORT", processed: 0, total: 1 });
  const result = await writeArtifact(artifact, resolve(options.outputPath));
  await progress.report({ stage: "EXPORT", processed: 1, total: 1 });
  return {
    ...result,
    runId,
    sourceRecordCount: artifact.sources.records.length,
    headwordCount: artifact.lexicon.headwords.length,
    aiMetrics: executor?.metrics ?? null,
    artifactManifest: artifact.manifest,
  };
}
