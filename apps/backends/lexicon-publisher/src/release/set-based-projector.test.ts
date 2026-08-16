import { Prisma } from "@sylis/database";
import {
  ArtifactCollectionPath,
  sylisLexiconArtifactV1Schema,
} from "@sylis/lexicon-artifact";
import { describe, expect, it } from "vitest";

import { ARTIFACT_COLLECTION_MAPPINGS } from "../artifact/mapping-registry";
import { ProjectionValueKind, projectionOverride } from "./projection-registry";
import {
  RELEASE_PROJECTIONS,
  ReleaseProjectionPhase,
  buildReleaseProjectionSql,
  releaseProjectionPhase,
} from "./set-based-projector";

interface SchemaNode {
  $ref?: string;
  allOf?: readonly SchemaNode[];
  anyOf?: readonly SchemaNode[];
  items?: SchemaNode;
  oneOf?: readonly SchemaNode[];
  properties?: Readonly<Record<string, SchemaNode>>;
}

const schema = sylisLexiconArtifactV1Schema as unknown as SchemaNode & {
  $defs: Readonly<Record<string, SchemaNode>>;
};
const models = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [model.name, model] as const),
);

const UNFILTERED_SPLIT_BASE_TABLES = new Set([
  "AssessmentSelectionRule",
  "AssessmentStimulusBlock",
  "EtymologyLink",
  "ExerciseResponseConfig",
  "PedagogicalMaterialBlock",
  "PedagogicalMaterialMention",
  "VocabularyBookItem",
]);

function dereference(node: SchemaNode): SchemaNode {
  let current = node;
  const visited = new Set<string>();
  while (current.$ref?.startsWith("#/$defs/")) {
    if (visited.has(current.$ref)) {
      throw new Error(`ARTIFACT_SCHEMA_REFERENCE_CYCLE:${current.$ref}`);
    }
    visited.add(current.$ref);
    const resolved = schema.$defs[current.$ref.slice("#/$defs/".length)];
    if (!resolved) throw new Error(`ARTIFACT_SCHEMA_REFERENCE_UNKNOWN`);
    current = resolved;
  }
  return current;
}

function collectionItem(path: string): SchemaNode {
  const collection = path
    .split("/")
    .filter(Boolean)
    .reduce((node, segment) => {
      const resolved = dereference(node);
      const child = resolved.properties?.[segment];
      if (!child) throw new Error(`ARTIFACT_SCHEMA_PATH_UNKNOWN:${path}`);
      return child;
    }, schema as SchemaNode);
  const item = dereference(collection).items;
  if (!item) throw new Error(`ARTIFACT_SCHEMA_COLLECTION_INVALID:${path}`);
  return item;
}

function collectPropertyNames(
  node: SchemaNode,
  target = new Set<string>(),
): ReadonlySet<string> {
  const resolved = dereference(node);
  for (const property of Object.keys(resolved.properties ?? {})) {
    target.add(property);
  }
  for (const branch of [
    ...(resolved.allOf ?? []),
    ...(resolved.anyOf ?? []),
    ...(resolved.oneOf ?? []),
  ]) {
    collectPropertyNames(branch, target);
  }
  return target;
}

describe("set-based release projector", () => {
  it("projects every collection target exactly once", () => {
    const expected = ARTIFACT_COLLECTION_MAPPINGS.flatMap(({ path, targets }) =>
      targets.map((targetTable) => `${path}:${targetTable}`),
    ).sort();
    const actual = RELEASE_PROJECTIONS.map(
      ({ collectionPath, targetTable }) => `${collectionPath}:${targetTable}`,
    ).sort();
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it("renders every target as one staging-backed INSERT SELECT", () => {
    for (const projection of RELEASE_PROJECTIONS) {
      const statement = buildReleaseProjectionSql(projection, {
        lexiconId: "00000000-0000-4000-8000-000000000001",
        publishRunId: "00000000-0000-4000-8000-000000000002",
        releaseId: "00000000-0000-4000-8000-000000000003",
      }) as unknown as { strings: readonly string[] };
      const sql = statement.strings.join("?");
      expect(sql, projection.targetTable).toContain("INSERT INTO");
      expect(sql, projection.targetTable).toContain("SELECT");
      expect(sql, projection.targetTable).toContain(
        'FROM "LexiconStagingRecord" AS staging',
      );
      expect(sql, projection.targetTable).toContain("jsonb_populate_record");
    }
  });

  it("orders every owning foreign-key dependency before its consumer", () => {
    const firstPosition = new Map<string, number>();
    RELEASE_PROJECTIONS.forEach(({ targetTable }, position) => {
      if (!firstPosition.has(targetTable)) {
        firstPosition.set(targetTable, position);
      }
    });
    for (const { targetTable } of RELEASE_PROJECTIONS) {
      const model = models.get(targetTable)!;
      for (const relation of model.fields.filter(
        (field) => field.kind === "object" && field.relationFromFields?.length,
      )) {
        if (
          relation.type === targetTable ||
          !firstPosition.has(relation.type)
        ) {
          continue;
        }
        expect(firstPosition.get(relation.type)).toBeLessThan(
          firstPosition.get(targetTable)!,
        );
      }
    }
  });

  it("orders source-backed evidence before every provenance-bearing fact", () => {
    const firstPosition = new Map<string, number>();
    RELEASE_PROJECTIONS.forEach(({ targetTable }, position) => {
      if (!firstPosition.has(targetTable))
        firstPosition.set(targetTable, position);
    });
    const sourceRecordPosition = firstPosition.get("SourceRecord");
    const evidencePosition = firstPosition.get("ContentEvidence");
    expect(sourceRecordPosition).toBeLessThan(evidencePosition!);
    for (const { targetTable } of RELEASE_PROJECTIONS) {
      if (
        targetTable === "ContentEvidence" ||
        !models
          .get(targetTable)!
          .fields.some((field) => field.name === "provenanceId")
      ) {
        continue;
      }
      expect(evidencePosition, targetTable).toBeLessThan(
        firstPosition.get(targetTable)!,
      );
    }
  });

  it("keeps the Bundle as the only pre-release prerequisite", () => {
    const prerequisite = RELEASE_PROJECTIONS.filter(
      (projection) =>
        releaseProjectionPhase(projection) ===
        ReleaseProjectionPhase.RELEASE_PREREQUISITE,
    );
    expect(prerequisite).toEqual([
      expect.objectContaining({ targetTable: "VocabularyBundle" }),
    ]);
    for (const projection of RELEASE_PROJECTIONS) {
      const hasReleaseId = models
        .get(projection.targetTable)!
        .fields.some((field) => field.name === "releaseId");
      expect(
        releaseProjectionPhase(projection) ===
          ReleaseProjectionPhase.RELEASE_SCOPED,
      ).toBe(hasReleaseId);
    }
  });

  it("defines a discriminator predicate for every typed split target", () => {
    for (const mapping of ARTIFACT_COLLECTION_MAPPINGS.filter(
      ({ targets }) => targets.length > 1,
    )) {
      for (const targetTable of mapping.targets) {
        if (UNFILTERED_SPLIT_BASE_TABLES.has(targetTable)) continue;
        expect(
          projectionOverride(mapping.path, targetTable).predicates,
          `${mapping.path}:${targetTable}`,
        ).not.toHaveLength(0);
      }
    }
  });

  it("uses the release-scoped exercise revision identity for every response subtype", () => {
    for (const targetTable of [
      "ExerciseChoiceResponseConfig",
      "ExerciseShortTextResponseConfig",
      "ExerciseExtendedTextResponseConfig",
      "ExerciseNoCaptureResponseConfig",
    ] as const) {
      expect(
        projectionOverride(
          ArtifactCollectionPath.EXERCISE_RESPONSE_CONFIGS,
          targetTable,
        ).fields?.exerciseRevisionId,
        targetTable,
      ).toEqual({
        kind: ProjectionValueKind.FACT_ID,
        path: ["exerciseRevisionId"],
      });
    }
  });

  it("assigns category-scoped stable identities to release quality statistics", () => {
    for (const [collectionPath, namespace] of [
      [
        ArtifactCollectionPath.QUALITY_SOURCE_STATISTICS,
        "release-quality-statistic-source",
      ],
      [
        ArtifactCollectionPath.QUALITY_EXERCISE_STATISTICS,
        "release-quality-statistic-exercise",
      ],
    ] as const) {
      const override = projectionOverride(
        collectionPath,
        "ReleaseQualityStatistic",
      );
      expect(override.fields?.id, collectionPath).toEqual({
        kind: ProjectionValueKind.NATURAL_FACT_ID,
        namespace,
        parts: [["key"]],
      });
    }
  });

  it("covers every required target column absent from the source row", () => {
    const missing: string[] = [];
    for (const mapping of ARTIFACT_COLLECTION_MAPPINGS) {
      const sourceProperties = collectPropertyNames(
        collectionItem(mapping.path),
      );
      for (const targetTable of mapping.targets) {
        const overrides = projectionOverride(mapping.path, targetTable).fields;
        for (const field of models.get(targetTable)!.fields) {
          if (
            field.kind === "object" ||
            field.hasDefaultValue ||
            !field.isRequired ||
            field.name === "releaseId" ||
            field.name === "lexiconId" ||
            sourceProperties.has(field.name) ||
            overrides?.[field.name]
          ) {
            continue;
          }
          missing.push(`${mapping.path}:${targetTable}.${field.name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("resolves generated ids that are absent from artifact rows", () => {
    const unresolved: string[] = [];
    for (const mapping of ARTIFACT_COLLECTION_MAPPINGS) {
      const sourceProperties = collectPropertyNames(
        collectionItem(mapping.path),
      );
      for (const targetTable of mapping.targets) {
        const model = models.get(targetTable)!;
        if (
          !model.fields.some((field) => field.name === "id") ||
          sourceProperties.has("id")
        ) {
          continue;
        }
        const override = projectionOverride(mapping.path, targetTable);
        if (!override.fields?.id) {
          unresolved.push(`${mapping.path}:${targetTable}.id`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });
});
