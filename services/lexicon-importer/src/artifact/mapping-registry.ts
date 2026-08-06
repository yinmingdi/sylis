import { sylisLexiconArtifactV1Schema } from "@sylis/lexicon-contracts";

interface SchemaNode {
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  $ref?: string;
}

export interface ArtifactCollectionMapping {
  path: string;
  owner:
    | "VOCABULARY"
    | "SOURCE"
    | "PROVENANCE"
    | "LEXICON"
    | "LEARNING"
    | "QUALITY";
  target: string;
  projection: "FORMAL_AND_LOSSLESS" | "LOSSLESS";
}

const TARGET_OVERRIDES: Record<string, string> = {
  "/lexicon/headwords": "Headword",
  "/lexicon/headwordRevisions": "HeadwordRevision",
  "/lexicon/entries": "LexicalEntry",
  "/lexicon/entryRevisions": "LexicalEntryRevision",
  "/lexicon/senses": "LexicalSense",
  "/lexicon/senseRevisions": "LexicalSenseRevision",
  "/lexicon/concepts": "LexicalConcept",
  "/lexicon/conceptRevisions": "LexicalConceptRevision",
  "/learning/books": "VocabularyBook",
  "/learning/bookEditions": "VocabularyBookEdition",
  "/learning/bookItems": "VocabularyBookItem",
  "/learning/learningObjectives": "LearningObjective",
  "/learning/objectiveRevisions": "LearningObjectiveRevision",
  "/learning/exerciseItems": "ExerciseItem",
  "/learning/exerciseRevisions": "ExerciseRevision",
};

function dereference(root: SchemaNode, node: SchemaNode): SchemaNode {
  let current = node;
  while (current.$ref?.startsWith("#/$defs/")) {
    const key = current.$ref.slice("#/$defs/".length);
    current =
      (root as { $defs?: Record<string, SchemaNode> }).$defs?.[key] ?? current;
    if (current === node) break;
  }
  return current;
}

function collect(
  root: SchemaNode,
  node: SchemaNode,
  segments: string[],
  paths: string[],
): void {
  const resolved = dereference(root, node);
  if (resolved.type === "array") {
    paths.push(`/${segments.join("/")}`);
    return;
  }
  for (const [key, child] of Object.entries(resolved.properties ?? {})) {
    collect(root, child, [...segments, key], paths);
  }
}

function targetName(path: string): string {
  if (TARGET_OVERRIDES[path]) return TARGET_OVERRIDES[path];
  const segment = path.split("/").at(-1) ?? "unknown";
  return segment
    .replace(/s$/, "")
    .replace(/^./, (value) => value.toUpperCase());
}

const schema = sylisLexiconArtifactV1Schema as unknown as SchemaNode;
const paths: string[] = [];
for (const section of [
  "vocabularies",
  "sources",
  "provenance",
  "lexicon",
  "learning",
  "quality",
]) {
  collect(schema, schema.properties?.[section] ?? {}, [section], paths);
}

export const ARTIFACT_COLLECTION_MAPPINGS: readonly ArtifactCollectionMapping[] =
  paths.sort().map((path) => ({
    path,
    owner: path
      .split("/")[1]!
      .toUpperCase() as ArtifactCollectionMapping["owner"],
    target: targetName(path),
    projection: "FORMAL_AND_LOSSLESS",
  }));

export const ARTIFACT_COLLECTION_PATHS = new Set(
  ARTIFACT_COLLECTION_MAPPINGS.map(({ path }) => path),
);

export function assertMappingRegistryComplete(): void {
  if (ARTIFACT_COLLECTION_PATHS.size !== ARTIFACT_COLLECTION_MAPPINGS.length) {
    throw new Error("ARTIFACT_MAPPING_REGISTRY_DUPLICATE_PATH");
  }
}
