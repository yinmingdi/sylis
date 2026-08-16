import { JSONParser } from "@streamparser/json";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { createHash, type Hash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZstdDecompress } from "node:zlib";

import { ArtifactCollectionPath } from "../artifact-collection-path";
import { sylisLexiconArtifactV1Schema } from "../schema";
import { artifactArrayItemOrderKey } from "./artifact-order";
import { ArtifactTokenValidator } from "./artifact-token-validator";
import {
  type ContentProfileReport,
  IncrementalContentProfileEvaluator,
} from "./profiles";
import { DiskBackedReferenceIndex } from "./reference-index";
import { publicArtifactRightsViolation } from "./source-rights";
import { StreamingLinguisticValidator } from "./stream-linguistics";
import { StreamingProvenanceValidator } from "./stream-provenance";
import { assertValidationSummary } from "./validation-summary";
import { inspectSingleZstdFrame } from "./zstd-envelope";
import type {
  ArtifactManifest,
  NamedCount,
  ValidationSummary,
} from "../types/artifact-v1";

type SchemaNode = Record<string, unknown>;

interface CollectionDescriptor {
  jsonPath: string;
  manifestPath: ArtifactCollectionPath;
  itemReference: string;
}

export interface ArtifactStreamValidationResult {
  schemaVersion: "sylis.lexicon-artifact/1";
  manifest: ArtifactManifest;
  validationSummary: ValidationSummary;
  contentHash: string;
  counts: Record<string, number>;
  compressedBytes: number;
  decompressedBytes: number;
  compressionRatio: number;
  idCount: number;
  referenceCount: number;
  profileSummary: ContentProfileSummary[];
  coverageSummary: ContentCoverageSummary[];
  sourceStatistics: NamedCount[];
  exerciseStatistics: NamedCount[];
  sample: ArtifactHeadwordSample[];
}

export interface ContentProfileSummary {
  key: string;
  targetKind: string;
  version: string;
  requirementsHash: string;
  evaluatedTargets: number;
  statuses: Record<string, number>;
}

export interface ContentCoverageSummary {
  requirementCode: string;
  status: string;
  count: number;
}

export interface ArtifactHeadwordSample {
  headwordId: string;
  displayText: string;
  normalizedText: string;
  entryCount: number;
  senseCount: number;
  profileStatuses: Record<string, Record<string, number>>;
}

export interface ArtifactStreamValidationOptions {
  expectedContentHash?: string;
  maxCompressedBytes?: number;
  maxDecompressedBytes?: number;
  maxCompressionRatio?: number;
  maxEntityBytes?: number;
  maxDepth?: number;
  maxStringBytes?: number;
}

const rootSchema = sylisLexiconArtifactV1Schema as unknown as SchemaNode;
const definitions = rootSchema.$defs as Record<string, SchemaNode>;
const rootProperties = rootSchema.properties as Record<string, SchemaNode>;
const rootId = rootSchema.$id as string;

function dereference(node: SchemaNode): SchemaNode {
  let current = node;
  const visited = new Set<string>();
  while (typeof current.$ref === "string") {
    const reference = current.$ref;
    if (!reference.startsWith("#/$defs/")) return current;
    if (visited.has(reference)) {
      throw new Error(`Recursive collection schema reference ${reference}.`);
    }
    visited.add(reference);
    const name = reference.slice("#/$defs/".length);
    const resolved = definitions[name];
    if (!resolved) throw new Error(`Unknown schema reference ${reference}.`);
    current = resolved;
  }
  return current;
}

function collectCollections(
  node: SchemaNode,
  segments: string[],
  result: CollectionDescriptor[],
): void {
  const resolved = dereference(node);
  if (resolved.type === "array") {
    const items = resolved.items as SchemaNode | undefined;
    if (!items || typeof items.$ref !== "string") {
      throw new Error(`Collection ${segments.join(".")} has no item schema.`);
    }
    const manifestPath = `/${segments.join("/")}`;
    if (
      !Object.values(ArtifactCollectionPath).includes(
        manifestPath as ArtifactCollectionPath,
      )
    ) {
      throw new Error(`Unknown artifact collection path ${manifestPath}.`);
    }
    result.push({
      jsonPath: `$.${segments.join(".")}`,
      manifestPath: manifestPath as ArtifactCollectionPath,
      itemReference: items.$ref,
    });
    return;
  }
  if (resolved.type !== "object") return;
  const properties = resolved.properties as
    | Record<string, SchemaNode>
    | undefined;
  for (const [name, child] of Object.entries(properties ?? {})) {
    collectCollections(child, [...segments, name], result);
  }
}

function collectionDescriptors(): CollectionDescriptor[] {
  const result: CollectionDescriptor[] = [];
  for (const section of [
    "vocabularies",
    "sources",
    "provenance",
    "lexicon",
    "learning",
    "quality",
  ]) {
    collectCollections(rootProperties[section], [section], result);
  }
  return result.sort((left, right) =>
    left.manifestPath.localeCompare(right.manifestPath),
  );
}

const collections = collectionDescriptors();
const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);
ajv.addSchema(sylisLexiconArtifactV1Schema);

function schemaValidator(reference: string): ValidateFunction {
  const validator = ajv.getSchema(`${rootId}${reference}`);
  if (!validator) throw new Error(`Unable to compile ${reference}.`);
  return validator;
}

const manifestValidator = schemaValidator("#/$defs/ArtifactManifest");
const validationSummaryValidator = schemaValidator("#/$defs/ValidationSummary");
const validatorsByPath = new Map(
  collections.map((collection) => [
    collection.jsonPath,
    schemaValidator(collection.itemReference),
  ]),
);

const PROFILE_COLLECTIONS = new Map<
  ArtifactCollectionPath,
  keyof ContentProfileReport
>([
  [ArtifactCollectionPath.QUALITY_PROFILES, "profiles"],
  [ArtifactCollectionPath.QUALITY_PROFILE_VERSIONS, "profileVersions"],
  [ArtifactCollectionPath.QUALITY_PROFILE_EVALUATIONS, "profileEvaluations"],
  [
    ArtifactCollectionPath.QUALITY_PROFILE_EVALUATION_TARGETS,
    "profileEvaluationTargets",
  ],
  [ArtifactCollectionPath.QUALITY_COVERAGE, "coverage"],
]);

function updateDigest(hash: Hash, value: unknown): void {
  const key = artifactArrayItemOrderKey(value);
  hash.update(String(Buffer.byteLength(key, "utf8")));
  hash.update(":");
  hash.update(key);
}

function digestValues(values: unknown[]): string {
  const hash = createHash("sha256");
  for (const value of values) updateDigest(hash, value);
  return hash.digest("hex");
}

function incrementNestedCount(
  counts: Map<string, Map<string, number>>,
  key: string,
  value: string,
): void {
  const values = counts.get(key) ?? new Map<string, number>();
  values.set(value, (values.get(value) ?? 0) + 1);
  counts.set(key, values);
}

function sortedRecord(values: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...values].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function callbackPath(
  stack: Array<{ key?: string | number }>,
  key: string | number | undefined,
): string {
  const segments = [
    ...stack.slice(1).map((element) => String(element.key)),
    String(key),
  ];
  return `$.${segments.join(".")}`;
}

function validationMessage(path: string, validator: ValidateFunction): string {
  const details = (validator.errors ?? [])
    .slice(0, 5)
    .map(
      (error) =>
        `${error.instancePath || "/"} ${error.message ?? error.keyword}`,
    )
    .join("; ");
  return `Artifact entity at ${path} is invalid: ${details}`;
}

function positiveIntegerLimit(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return resolved;
}

export async function validateArtifactStream(
  inputPath: string,
  options: ArtifactStreamValidationOptions = {},
): Promise<ArtifactStreamValidationResult> {
  const maxCompressedBytes = positiveIntegerLimit(
    options.maxCompressedBytes,
    512 * 1024 * 1024,
    "Compressed byte limit",
  );
  const maxDecompressedBytes = positiveIntegerLimit(
    options.maxDecompressedBytes,
    512 * 1024 * 1024,
    "Decompressed byte limit",
  );
  const maxEntityBytes = positiveIntegerLimit(
    options.maxEntityBytes,
    8 * 1024 * 1024,
    "Entity byte limit",
  );
  const maxDepth = positiveIntegerLimit(options.maxDepth, 64, "Depth limit");
  const maxStringBytes = positiveIntegerLimit(
    options.maxStringBytes,
    1024 * 1024,
    "String byte limit",
  );
  const maxCompressionRatio = options.maxCompressionRatio ?? 200;
  if (!Number.isFinite(maxCompressionRatio) || maxCompressionRatio < 1) {
    throw new Error("Compression ratio limit must be at least 1.");
  }
  const compressedBytes = await inspectSingleZstdFrame(
    inputPath,
    maxCompressedBytes,
  );
  const referenceRoot = await mkdtemp(
    join(tmpdir(), "sylis-artifact-references-"),
  );
  const referenceIndex = new DiskBackedReferenceIndex(referenceRoot);
  try {
    const counts = new Map(
      collections.map((collection) => [collection.manifestPath, 0]),
    );
    const collectionByJsonPath = new Map(
      collections.map((collection) => [collection.jsonPath, collection]),
    );
    const previousOrderKey = new Map<string, string>();
    const tokenValidator = new ArtifactTokenValidator(
      new Set(collections.map((collection) => collection.manifestPath)),
      { maxDepth, maxStringBytes },
    );
    const linguisticValidator = new StreamingLinguisticValidator();
    const provenanceValidator = new StreamingProvenanceValidator();
    const profileEvaluator = new IncrementalContentProfileEvaluator();
    const actualProfileDigests = new Map(
      [...PROFILE_COLLECTIONS.keys()].map((path) => [
        path,
        createHash("sha256"),
      ]),
    );
    const entriesByHeadword = new Map<string, Set<string>>();
    const sensesByEntry = new Map<string, Set<string>>();
    const sourceDatasetKeys = new Map<string, string>();
    const sourceDatasetVersions: Array<{
      datasetId: string;
      version: string;
      checksum: string;
    }> = [];
    const sampleCandidates: Array<{
      score: string;
      headwordId: string;
      displayText: string;
      normalizedText: string;
    }> = [];
    const sourceStatistics: NamedCount[] = [];
    const exerciseStatistics: NamedCount[] = [];
    let manifest: ArtifactManifest | undefined;
    let validationSummary: ValidationSummary | undefined;
    let schemaVersion: unknown;
    let decompressedBytes = 0;
    let applicationError: Error | undefined;
    let parserError: Error | undefined;
    const utf8 = new TextDecoder("utf-8", { fatal: true });

    const parser = new JSONParser({
      keepStack: false,
      stringBufferSize: 64 * 1024,
      numberBufferSize: 64,
      emitPartialTokens: true,
      paths: [
        "$.schemaVersion",
        "$.manifest",
        "$.quality.validationSummary",
        ...collections.map((collection) => `${collection.jsonPath}.*`),
      ],
    });
    parser.onToken = ({ token, value, partial }) => {
      tokenValidator.accept(token, value, partial === true);
    };
    parser.onError = (error) => {
      parserError = error;
    };
    parser.onValue = ({ value, key, stack }) => {
      if (applicationError) return;
      const path = callbackPath(stack, key);
      if (path === "$.schemaVersion") {
        schemaVersion = value;
        return;
      }
      if (path === "$.manifest") {
        if (!manifestValidator(value)) {
          applicationError = new Error(
            validationMessage(path, manifestValidator),
          );
          return;
        }
        manifest = value as unknown as ArtifactManifest;
        profileEvaluator.acceptManifest(manifest);
        return;
      }
      if (path === "$.quality.validationSummary") {
        if (!validationSummaryValidator(value)) {
          applicationError = new Error(
            validationMessage(path, validationSummaryValidator),
          );
        } else {
          validationSummary = value as unknown as ValidationSummary;
        }
        return;
      }

      const arrayPath = path.replace(/\.\d+$/, "");
      const collection = collectionByJsonPath.get(arrayPath);
      const validator = validatorsByPath.get(arrayPath);
      if (!collection || !validator) {
        applicationError = new Error(
          `Unexpected streamed artifact path ${path}.`,
        );
        return;
      }
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        applicationError = new Error(
          `Artifact entity at ${path} has no JSON value.`,
        );
        return;
      }
      const entityBytes = Buffer.byteLength(serialized, "utf8");
      if (entityBytes > maxEntityBytes) {
        applicationError = new Error(
          `Artifact entity at ${path} exceeds the byte limit.`,
        );
        return;
      }
      if (!validator(value)) {
        applicationError = new Error(validationMessage(path, validator));
        return;
      }
      if (
        collection.manifestPath ===
        ArtifactCollectionPath.SOURCE_RIGHTS_POLICIES
      ) {
        const violation = publicArtifactRightsViolation(
          value as {
            key: string;
            mayBuild: boolean;
            mayServe: boolean;
            mayExport: boolean;
            requiresAttribution: boolean;
            attribution: string | null;
          },
        );
        if (violation) {
          applicationError = new Error(violation);
          return;
        }
      }

      const orderKey = artifactArrayItemOrderKey(value);
      const previous = previousOrderKey.get(collection.manifestPath);
      if (previous !== undefined && previous > orderKey) {
        applicationError = new Error(
          `Artifact collection ${collection.manifestPath} is not in stable order at ${path}.`,
        );
        return;
      }
      previousOrderKey.set(collection.manifestPath, orderKey);
      const position = counts.get(collection.manifestPath) ?? 0;
      const entityPath = `${collection.manifestPath}/${position}`;
      referenceIndex.addEntity(value, entityPath, collection.manifestPath);
      provenanceValidator.accept(collection.manifestPath, value, entityPath);
      linguisticValidator.accept(collection.manifestPath, value);
      profileEvaluator.acceptCollection(collection.manifestPath, value);
      if (typeof value === "object" && value !== null) {
        const item = value as Record<string, unknown>;
        if (
          collection.manifestPath === ArtifactCollectionPath.ENTRY_REVISIONS
        ) {
          const headwordId = String(item.headwordId);
          const values = entriesByHeadword.get(headwordId) ?? new Set<string>();
          values.add(String(item.entryId));
          entriesByHeadword.set(headwordId, values);
        } else if (
          collection.manifestPath === ArtifactCollectionPath.SENSE_REVISIONS
        ) {
          const entryId = String(item.entryId);
          const values = sensesByEntry.get(entryId) ?? new Set<string>();
          values.add(String(item.senseId));
          sensesByEntry.set(entryId, values);
        } else if (
          collection.manifestPath === ArtifactCollectionPath.HEADWORD_REVISIONS
        ) {
          const candidate = {
            score: createHash("sha256")
              .update(
                `${String(item.headwordId)}:${String(item.normalizedText)}`,
              )
              .digest("hex"),
            headwordId: String(item.headwordId),
            displayText: String(item.displayText),
            normalizedText: String(item.normalizedText),
          };
          sampleCandidates.push(candidate);
          sampleCandidates.sort((left, right) =>
            left.score < right.score ? -1 : left.score > right.score ? 1 : 0,
          );
          if (sampleCandidates.length > 20) sampleCandidates.pop();
        } else if (
          collection.manifestPath ===
          ArtifactCollectionPath.QUALITY_SOURCE_STATISTICS
        ) {
          sourceStatistics.push(value as unknown as NamedCount);
        } else if (
          collection.manifestPath ===
          ArtifactCollectionPath.QUALITY_EXERCISE_STATISTICS
        ) {
          exerciseStatistics.push(value as unknown as NamedCount);
        } else if (
          collection.manifestPath === ArtifactCollectionPath.SOURCE_DATASETS
        ) {
          sourceDatasetKeys.set(String(item.id), String(item.key));
        } else if (
          collection.manifestPath ===
          ArtifactCollectionPath.SOURCE_DATASET_VERSIONS
        ) {
          sourceDatasetVersions.push({
            datasetId: String(item.datasetId),
            version: String(item.version),
            checksum: String(item.checksum),
          });
        }
      }
      const profileDigest = actualProfileDigests.get(collection.manifestPath);
      if (profileDigest) updateDigest(profileDigest, value);
      counts.set(collection.manifestPath, position + 1);
    };

    const decompressed = createReadStream(inputPath).pipe(
      createZstdDecompress(),
    );
    for await (const chunk of decompressed) {
      const bytes = Buffer.from(chunk);
      utf8.decode(bytes, { stream: true });
      decompressedBytes += bytes.length;
      if (decompressedBytes > maxDecompressedBytes) {
        decompressed.destroy();
        throw new Error("Artifact exceeds decompressed byte limit.");
      }
      if (decompressedBytes / compressedBytes > maxCompressionRatio) {
        decompressed.destroy();
        throw new Error("Artifact exceeds compression ratio limit.");
      }
      parser.write(bytes);
      if (applicationError) {
        decompressed.destroy();
        throw applicationError;
      }
      if (parserError) throw parserError;
    }
    utf8.decode();
    if (!parser.isEnded) parser.end();
    if (applicationError) throw applicationError;
    if (parserError) throw parserError;
    if (schemaVersion !== "sylis.lexicon-artifact/1") {
      throw new Error(`Unsupported streamed artifact schema ${schemaVersion}.`);
    }
    if (!manifest) throw new Error("Artifact manifest was not found.");
    if (!validationSummary) {
      throw new Error("Artifact validation summary was not found.");
    }
    assertValidationSummary(validationSummary);
    if (
      manifest.build.validatorVersion !== validationSummary.validatorVersion
    ) {
      throw new Error(
        `Artifact validator version mismatch: manifest ${manifest.build.validatorVersion}, summary ${validationSummary.validatorVersion}.`,
      );
    }
    const orderedManifestSourceInputs = [...manifest.inputs.sources].sort(
      (left, right) => left.key.localeCompare(right.key),
    );
    if (
      JSON.stringify(manifest.inputs.sources) !==
      JSON.stringify(orderedManifestSourceInputs)
    ) {
      throw new Error(
        "Artifact manifest source inputs are not in stable order.",
      );
    }
    const expectedSourceInputs = orderedManifestSourceInputs.map(
      ({ key, version, checksum }) => ({ key, version, checksum }),
    );
    const actualSourceInputs = sourceDatasetVersions
      .map(({ datasetId, version, checksum }) => ({
        key: sourceDatasetKeys.get(datasetId),
        version,
        checksum,
      }))
      .sort((left, right) => String(left.key).localeCompare(String(right.key)));
    if (
      new Set(expectedSourceInputs.map(({ key }) => key)).size !==
        expectedSourceInputs.length ||
      JSON.stringify(expectedSourceInputs) !==
        JSON.stringify(actualSourceInputs)
    ) {
      throw new Error(
        "Artifact manifest source inputs do not match source dataset versions.",
      );
    }

    const actualCounts = Object.fromEntries(counts);
    const expectedPaths = Object.keys(manifest.counts).sort();
    const actualPaths = Object.keys(actualCounts).sort();
    if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
      throw new Error(
        "Artifact manifest collection paths do not match schema.",
      );
    }
    for (const path of expectedPaths) {
      if (manifest.counts[path] !== actualCounts[path]) {
        throw new Error(
          `Artifact count mismatch at ${path}: expected ${manifest.counts[path]}, received ${actualCounts[path]}.`,
        );
      }
    }

    const computedContentHash = tokenValidator.finish();
    if (manifest.contentHash !== computedContentHash) {
      throw new Error(
        `Artifact content hash mismatch: expected ${manifest.contentHash}, computed ${computedContentHash}.`,
      );
    }
    if (
      options.expectedContentHash &&
      computedContentHash !== options.expectedContentHash
    ) {
      throw new Error("Artifact content hash changed during write/readback.");
    }

    const referenceReport = referenceIndex.validate();
    provenanceValidator.finish();
    const linguisticIssues = linguisticValidator.issues();
    if (linguisticIssues.length > 0) {
      throw new Error(
        `Artifact linguistic validation failed: ${linguisticIssues
          .slice(0, 10)
          .map((issue) => `${issue.code}:${issue.entityId ?? "artifact"}`)
          .join(",")}.`,
      );
    }
    const expectedProfiles = profileEvaluator.evaluate();
    for (const [path, reportKey] of PROFILE_COLLECTIONS) {
      const expectedValues = [...expectedProfiles[reportKey]].sort(
        (left, right) => {
          const leftKey = artifactArrayItemOrderKey(left);
          const rightKey = artifactArrayItemOrderKey(right);
          return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        },
      );
      const actualDigest = actualProfileDigests.get(path)!.digest("hex");
      if (actualDigest !== digestValues(expectedValues)) {
        throw new Error(`Artifact content profile mismatch at ${path}.`);
      }
    }
    const versionsByProfile = new Map(
      expectedProfiles.profileVersions.map((version) => [
        version.profileId,
        version,
      ]),
    );
    const profileByVersion = new Map(
      expectedProfiles.profileVersions.map((version) => [
        version.id,
        expectedProfiles.profiles.find(
          (profile) => profile.id === version.profileId,
        )!,
      ]),
    );
    const profileSummary = expectedProfiles.profiles.map((profile) => {
      const version = versionsByProfile.get(profile.id)!;
      const evaluations = expectedProfiles.profileEvaluations.filter(
        (evaluation) => evaluation.profileVersionId === version.id,
      );
      const statuses = new Map<string, number>();
      for (const evaluation of evaluations) {
        statuses.set(
          evaluation.status,
          (statuses.get(evaluation.status) ?? 0) + 1,
        );
      }
      return {
        key: profile.key,
        targetKind: profile.targetKind,
        version: version.version,
        requirementsHash: version.requirementsHash,
        evaluatedTargets: evaluations.length,
        statuses: sortedRecord(statuses),
      };
    });
    const coverageCounts = new Map<string, Map<string, number>>();
    for (const coverage of expectedProfiles.coverage) {
      incrementNestedCount(
        coverageCounts,
        coverage.requirementCode,
        coverage.status,
      );
    }
    const coverageSummary = [...coverageCounts]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .flatMap(([requirementCode, statuses]) =>
        [...statuses]
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([status, count]) => ({ requirementCode, status, count })),
      );
    const evaluationById = new Map(
      expectedProfiles.profileEvaluations.map((evaluation) => [
        evaluation.id,
        evaluation,
      ]),
    );
    const targetsById = new Map<string, string[]>();
    for (const target of expectedProfiles.profileEvaluationTargets) {
      const values = targetsById.get(target.target.targetId) ?? [];
      values.push(target.evaluationId);
      targetsById.set(target.target.targetId, values);
    }
    const sample = sampleCandidates.map((candidate) => {
      const entryIds = [...(entriesByHeadword.get(candidate.headwordId) ?? [])];
      const senseIds = entryIds.flatMap((entryId) => [
        ...(sensesByEntry.get(entryId) ?? []),
      ]);
      const profileStatuses = new Map<string, Map<string, number>>();
      for (const targetId of [...entryIds, ...senseIds]) {
        for (const evaluationId of targetsById.get(targetId) ?? []) {
          const evaluation = evaluationById.get(evaluationId)!;
          const profile = profileByVersion.get(evaluation.profileVersionId)!;
          incrementNestedCount(profileStatuses, profile.key, evaluation.status);
        }
      }
      return {
        headwordId: candidate.headwordId,
        displayText: candidate.displayText,
        normalizedText: candidate.normalizedText,
        entryCount: entryIds.length,
        senseCount: senseIds.length,
        profileStatuses: Object.fromEntries(
          [...profileStatuses]
            .sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            )
            .map(([key, statuses]) => [key, sortedRecord(statuses)]),
        ),
      };
    });
    return {
      schemaVersion,
      manifest,
      validationSummary,
      contentHash: computedContentHash,
      counts: actualCounts,
      compressedBytes,
      decompressedBytes,
      compressionRatio: decompressedBytes / compressedBytes,
      ...referenceReport,
      profileSummary,
      coverageSummary,
      sourceStatistics,
      exerciseStatistics,
      sample,
    };
  } finally {
    referenceIndex.closeWrites();
    await rm(referenceRoot, { recursive: true, force: true });
  }
}
