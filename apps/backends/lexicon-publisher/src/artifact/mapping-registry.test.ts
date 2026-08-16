import { describe, expect, it } from "vitest";
import { ArtifactCollectionPath } from "@sylis/lexicon-artifact";

import {
  ARTIFACT_COLLECTION_MAPPINGS,
  ARTIFACT_COLLECTION_PATHS,
  ARTIFACT_SCHEMA_COLLECTION_PATHS,
  ArtifactCollectionOwner,
  assertMappingRegistryComplete,
} from "./mapping-registry";

describe("artifact mapping registry", () => {
  it("maps every schema collection exactly once", () => {
    expect(assertMappingRegistryComplete).not.toThrow();
    expect([...ARTIFACT_COLLECTION_PATHS].sort()).toEqual(
      [...ARTIFACT_SCHEMA_COLLECTION_PATHS].sort(),
    );
    expect(ARTIFACT_COLLECTION_MAPPINGS).toHaveLength(
      ARTIFACT_COLLECTION_PATHS.size,
    );
  });

  it("assigns source and vocabulary collections to their formal owners", () => {
    const owners = new Map(
      ARTIFACT_COLLECTION_MAPPINGS.map(({ path, owner }) => [path, owner]),
    );
    expect(owners.get(ArtifactCollectionPath.SOURCE_DATASETS)).toBe(
      ArtifactCollectionOwner.SOURCE,
    );
    expect(owners.get(ArtifactCollectionPath.VOCABULARY_TERMS)).toBe(
      ArtifactCollectionOwner.VOCABULARY,
    );
  });
});
