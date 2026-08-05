import {
  listArtifactCollections,
  type SylisLexiconArtifactV1,
} from "@sylis/lexicon-contracts";

import { canonicalJsonChunks } from "./canonicalize";

const BUSINESS_KEY_NAMES = new Set([
  "id",
  "identityKey",
  "key",
  "sourceKey",
  "version",
  "code",
  "position",
  "displayOrder",
  "rank",
  "target",
]);

function compareUnicode(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  return [...canonicalJsonChunks(value)].join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function artifactArrayItemOrderKey(value: unknown): string {
  const canonical = canonicalJson(value);
  if (!isRecord(value)) return canonical;

  const businessKey = Object.keys(value)
    .filter(
      (key) =>
        BUSINESS_KEY_NAMES.has(key) ||
        key.endsWith("Id") ||
        key.endsWith("Key"),
    )
    .sort(compareUnicode)
    .map((key) => `${key}:${canonicalJson(value[key])}`)
    .join("\u001f");
  return `${businessKey}\u001e${canonical}`;
}

export function sortArtifactArrays(artifact: SylisLexiconArtifactV1): void {
  for (const collection of listArtifactCollections(artifact)) {
    collection.values.sort((left, right) =>
      compareUnicode(
        artifactArrayItemOrderKey(left),
        artifactArrayItemOrderKey(right),
      ),
    );
  }
}
