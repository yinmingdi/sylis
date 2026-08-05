import type {
  ArtifactValidationIssue,
  ArtifactValidationReport,
} from "./shape";
import type { SylisLexiconArtifactV1 } from "../types/artifact-v1";

interface Collection {
  path: string;
  values: unknown[];
}

export const ARTIFACT_TARGET_COLLECTIONS: Readonly<Record<string, string>> = {
  HEADWORD: "/lexicon/headwords",
  ENTRY: "/lexicon/entries",
  FORM: "/lexicon/forms",
  SENSE: "/lexicon/senses",
  CONCEPT: "/lexicon/concepts",
  SENSE_EXAMPLE: "/lexicon/senseExamples",
  COLLOCATION: "/lexicon/collocations",
  FRAME: "/lexicon/frames",
  MORPHEME: "/lexicon/morphology/morphemes",
  WORD_FORMATION: "/lexicon/morphology/wordFormations",
  ETYMON: "/lexicon/etymology/etymons",
  LEARNING_OBJECTIVE: "/learning/learningObjectives",
  PEDAGOGICAL_MATERIAL: "/learning/pedagogicalMaterials",
  EXERCISE: "/learning/exerciseItems",
  BOOK_EDITION: "/learning/bookEditions",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function listArtifactCollections(
  artifact: SylisLexiconArtifactV1,
): Collection[] {
  const collections: Collection[] = [];

  function visit(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      collections.push({ path, values: value });
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      visit(child, `${path}/${key}`);
    }
  }

  for (const section of [
    "vocabularies",
    "sources",
    "provenance",
    "lexicon",
    "learning",
    "quality",
  ] as const) {
    visit(artifact[section], `/${section}`);
  }
  return collections;
}

export function updateManifestCounts(artifact: SylisLexiconArtifactV1): void {
  artifact.manifest.counts = Object.fromEntries(
    listArtifactCollections(artifact)
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(({ path, values }) => [path, values.length]),
  );
}

export function validateArtifactReferences(
  artifact: SylisLexiconArtifactV1,
): ArtifactValidationReport {
  const issues: ArtifactValidationIssue[] = [];
  const collections = listArtifactCollections(artifact);
  const allIds = new Map<string, string>();
  const idsByPath = new Map<string, Set<string>>();

  for (const collection of collections) {
    const ids = new Set<string>();
    idsByPath.set(collection.path, ids);
    for (const [index, value] of collection.values.entries()) {
      if (!isRecord(value) || typeof value.id !== "string") continue;
      const previous = allIds.get(value.id);
      if (previous) {
        issues.push({
          code: "DUPLICATE_ID",
          path: `${collection.path}/${index}/id`,
          message: `ID ${value.id} is already used at ${previous}.`,
          severity: "ERROR",
        });
      } else {
        allIds.set(value.id, `${collection.path}/${index}/id`);
      }
      ids.add(value.id);
    }
  }

  function inspect(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((child, index) => inspect(child, `${path}/${index}`));
      return;
    }
    if (!isRecord(value)) return;

    if (
      typeof value.targetKind === "string" &&
      typeof value.targetId === "string"
    ) {
      const targetPath = ARTIFACT_TARGET_COLLECTIONS[value.targetKind];
      if (targetPath && !idsByPath.get(targetPath)?.has(value.targetId)) {
        issues.push({
          code: "INVALID_TYPED_TARGET",
          path: `${path}/targetId`,
          message: `${value.targetKind} target ${value.targetId} does not exist.`,
          severity: "ERROR",
        });
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key !== "id" &&
        key !== "externalId" &&
        key.endsWith("Id") &&
        typeof child === "string" &&
        !allIds.has(child)
      ) {
        issues.push({
          code: "MISSING_REFERENCE",
          path: `${path}/${key}`,
          message: `Referenced ID ${child} does not exist.`,
          severity: "ERROR",
        });
      }
      if (key === "rawPayload") continue;
      inspect(child, `${path}/${key}`);
    }
  }

  inspect(artifact, "");

  const expectedCounts = Object.fromEntries(
    collections.map(({ path, values }) => [path, values.length]),
  );
  for (const [path, count] of Object.entries(expectedCounts)) {
    if (artifact.manifest.counts[path] !== count) {
      issues.push({
        code: "COUNT_MISMATCH",
        path: `/manifest/counts/${path.replaceAll("/", "~1")}`,
        message: `Expected ${count}; received ${String(artifact.manifest.counts[path])}.`,
        severity: "ERROR",
      });
    }
  }
  for (const path of Object.keys(artifact.manifest.counts)) {
    if (!(path in expectedCounts)) {
      issues.push({
        code: "UNKNOWN_COUNT_PATH",
        path: `/manifest/counts/${path.replaceAll("/", "~1")}`,
        message: `${path} is not an artifact entity collection.`,
        severity: "ERROR",
      });
    }
  }

  return { valid: issues.length === 0, issues };
}
