import {
  Prisma,
  type PrismaTypes,
  type SylisTransaction,
} from "@sylis/database";

import {
  ProjectionConflictPolicy,
  ProjectionValueKind,
  projectionOverride,
  type ProjectionPredicate,
  type ProjectionValue,
} from "./projection-registry";
import {
  ARTIFACT_COLLECTION_MAPPINGS,
  assertMappingRegistryComplete,
  type ArtifactTargetTable,
} from "../artifact/mapping-registry";

interface DmmfField {
  hasDefaultValue: boolean;
  isReadOnly: boolean;
  isRequired: boolean;
  isUpdatedAt?: boolean;
  kind: "enum" | "object" | "scalar" | "unsupported";
  name: string;
  relationFromFields?: readonly string[];
  relationToFields?: readonly string[];
  type: string;
}

interface DmmfModel {
  dbName: string | null;
  fields: readonly DmmfField[];
  name: string;
}

export interface ReleaseProjectionContext {
  lexiconId: string;
  publishRunId: string;
  releaseId: string;
}

export interface ReleaseProjection {
  collectionPath: (typeof ARTIFACT_COLLECTION_MAPPINGS)[number]["path"];
  targetTable: ArtifactTargetTable;
}

export enum ReleaseProjectionPhase {
  RELEASE_SCOPED = "RELEASE_SCOPED",
  RELEASE_PREREQUISITE = "RELEASE_PREREQUISITE",
  STABLE = "STABLE",
}

const STABLE_UUID_FUNCTION = `
  CREATE OR REPLACE FUNCTION pg_temp.sylis_release_fact_id(
    release_id uuid,
    artifact_id text
  ) RETURNS uuid
  LANGUAGE SQL
  IMMUTABLE
  PARALLEL SAFE
  AS $function$
    WITH source AS (
      SELECT sha256(
        convert_to(
          'sylis.lexicon-release-fact/1' || chr(31) ||
          release_id::text || chr(31) || artifact_id,
          'UTF8'
        )
      ) AS bytes
    ), versioned AS (
      SELECT set_byte(
        set_byte(substring(bytes FROM 1 FOR 16), 6, (get_byte(bytes, 6) & 15) | 80),
        8,
        (get_byte(bytes, 8) & 63) | 128
      ) AS bytes
      FROM source
    ), encoded AS (
      SELECT encode(bytes, 'hex') AS value FROM versioned
    )
    SELECT (
      substring(value, 1, 8) || '-' ||
      substring(value, 9, 4) || '-' ||
      substring(value, 13, 4) || '-' ||
      substring(value, 17, 4) || '-' ||
      substring(value, 21, 12)
    )::uuid
    FROM encoded
  $function$
`;

const INCLUDED_DEFAULT_FIELDS = new Set([
  "Headword.artifactRole",
  "LexicalConcept.artifactRole",
  "LexicalEntry.artifactRole",
  "LexicalSense.artifactRole",
  "Etymon.artifactRole",
  "Morph.artifactRole",
  "Morpheme.artifactRole",
  "VocabularyTerm.deprecated",
  "ExampleCitation.verified",
  "SyntacticArgument.optional",
  "ExerciseAcceptedText.weight",
]);

const dmmfModels = new Map<string, DmmfModel>(
  Prisma.dmmf.datamodel.models.map((model) => [model.name, model] as const),
);

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replaceAll('"', '""')}"`;

const identifier = (value: string): PrismaTypes.Sql =>
  Prisma.raw(quoteIdentifier(value));

const jsonPath = (segments: readonly string[]): PrismaTypes.Sql =>
  Prisma.sql`ARRAY[${Prisma.join(segments)}]::text[]`;

const jsonAt = (segments: readonly string[]): PrismaTypes.Sql =>
  Prisma.sql`staging.payload #> ${jsonPath(segments)}`;

const textAt = (segments: readonly string[]): PrismaTypes.Sql =>
  Prisma.sql`staging.payload #>> ${jsonPath(segments)}`;

const nullableFactId = (
  context: ReleaseProjectionContext,
  segments: readonly string[],
): PrismaTypes.Sql => Prisma.sql`
  CASE
    WHEN ${jsonAt(segments)} IS NULL OR ${jsonAt(segments)} = 'null'::jsonb
      THEN 'null'::jsonb
    ELSE to_jsonb(
      pg_temp.sylis_release_fact_id(
        ${context.releaseId}::uuid,
        ${textAt(segments)}
      )::text
    )
  END
`;

function projectionValueSql(
  value: ProjectionValue,
  context: ReleaseProjectionContext,
): PrismaTypes.Sql {
  switch (value.kind) {
    case ProjectionValueKind.SOURCE:
      return jsonAt(value.path);
    case ProjectionValueKind.RELEASE_ID:
      return Prisma.sql`to_jsonb(${context.releaseId}::text)`;
    case ProjectionValueKind.LEXICON_ID:
      return Prisma.sql`to_jsonb(${context.lexiconId}::text)`;
    case ProjectionValueKind.FACT_ID:
      return nullableFactId(context, value.path);
    case ProjectionValueKind.NATURAL_FACT_ID: {
      const parts = [
        Prisma.sql`${value.namespace}`,
        ...value.parts.map((part) => textAt(part)),
      ];
      return Prisma.sql`to_jsonb(
        pg_temp.sylis_release_fact_id(
          ${context.releaseId}::uuid,
          concat_ws(chr(31), ${Prisma.join(parts)})
        )::text
      )`;
    }
    case ProjectionValueKind.LITERAL:
      return Prisma.sql`to_jsonb(${value.value}::text)`;
    case ProjectionValueKind.SHA256_TEXT:
      return Prisma.sql`to_jsonb(
        'sha256:' || encode(
          sha256(convert_to(${textAt(value.path)}, 'UTF8')),
          'hex'
        )
      )`;
    case ProjectionValueKind.NORMALIZED_TEXT:
      return Prisma.sql`to_jsonb(
        lower(normalize(btrim(${textAt(value.path)}), NFC))
      )`;
    case ProjectionValueKind.CONDITIONAL_SOURCE:
      return Prisma.sql`
        CASE
          WHEN ${textAt(value.discriminatorPath)} = ${value.equals}
            THEN ${jsonAt(value.path)}
          ELSE 'null'::jsonb
        END
      `;
  }
}

function predicateSql(predicate: ProjectionPredicate): PrismaTypes.Sql {
  return Prisma.sql`${textAt(predicate.path)} = ${predicate.equals}`;
}

function modelFor(targetTable: ArtifactTargetTable): DmmfModel {
  const model = dmmfModels.get(targetTable);
  if (!model)
    throw new Error(`ARTIFACT_PROJECTION_MODEL_UNKNOWN:${targetTable}`);
  return model;
}

function releaseScopedModels(): ReadonlySet<string> {
  return new Set(
    [...dmmfModels.values()]
      .filter((model) =>
        model.fields.some((field) => field.name === "releaseId"),
      )
      .map((model) => model.name),
  );
}

const releaseScoped = releaseScopedModels();
const PROVENANCE_EVIDENCE_MODEL = "ContentEvidence";

export function releaseProjectionPhase(
  projection: ReleaseProjection,
): ReleaseProjectionPhase {
  const isReleaseScoped = modelFor(projection.targetTable).fields.some(
    (field) => field.name === "releaseId",
  );
  return isReleaseScoped
    ? ReleaseProjectionPhase.RELEASE_SCOPED
    : projection.targetTable === "VocabularyBundle"
      ? ReleaseProjectionPhase.RELEASE_PREREQUISITE
      : ReleaseProjectionPhase.STABLE;
}

function inferredForeignKeyOverrides(
  model: DmmfModel,
): Readonly<Record<string, ProjectionValue>> {
  const overrides: Record<string, ProjectionValue> = {};
  for (const relation of model.fields.filter(
    (field) => field.kind === "object" && field.relationFromFields?.length,
  )) {
    if (!releaseScoped.has(relation.type)) continue;
    relation.relationFromFields!.forEach((fromField, index) => {
      if (relation.relationToFields?.[index] !== "id") return;
      overrides[fromField] = {
        kind: ProjectionValueKind.FACT_ID,
        path: [fromField],
      };
    });
  }
  return overrides;
}

function projectedColumns(
  model: DmmfModel,
  overrides: Readonly<Record<string, ProjectionValue>>,
): readonly DmmfField[] {
  return model.fields.filter((field) => {
    if (field.kind === "object" || field.isUpdatedAt) {
      return false;
    }
    if (overrides[field.name]) return true;
    if (!field.hasDefaultValue) return true;
    if (field.name === "id") return true;
    return INCLUDED_DEFAULT_FIELDS.has(`${model.name}.${field.name}`);
  });
}

export function buildReleaseProjectionSql(
  projection: ReleaseProjection,
  context: ReleaseProjectionContext,
): PrismaTypes.Sql {
  const model = modelFor(projection.targetTable);
  const configured = projectionOverride(
    projection.collectionPath,
    projection.targetTable,
  );
  const fields: Record<string, ProjectionValue> = {
    ...inferredForeignKeyOverrides(model),
    ...(model.fields.some((field) => field.name === "releaseId")
      ? { releaseId: { kind: ProjectionValueKind.RELEASE_ID } as const }
      : {}),
    ...(model.fields.some((field) => field.name === "lexiconId")
      ? { lexiconId: { kind: ProjectionValueKind.LEXICON_ID } as const }
      : {}),
    ...(model.fields.some((field) => field.name === "id") &&
    model.fields.some((field) => field.name === "releaseId")
      ? {
          id: {
            kind: ProjectionValueKind.FACT_ID,
            path: ["id"],
          } as const,
        }
      : {}),
    ...(configured.fields ?? {}),
  };
  const columns = projectedColumns(model, fields);
  if (columns.length === 0) {
    throw new Error(`ARTIFACT_PROJECTION_COLUMNS_EMPTY:${model.name}`);
  }
  const patches = Object.entries(fields).flatMap(([field, value]) => [
    Prisma.sql`${field}`,
    projectionValueSql(value, context),
  ]);
  const patchedPayload =
    patches.length === 0
      ? Prisma.sql`staging.payload`
      : Prisma.sql`staging.payload || jsonb_build_object(${Prisma.join(patches)})`;
  const tableName = model.dbName ?? model.name;
  const predicates = configured.predicates ?? [];
  const predicateClause =
    predicates.length === 0
      ? Prisma.empty
      : Prisma.join(
          predicates.map(
            (predicate) => Prisma.sql`AND ${predicateSql(predicate)}`,
          ),
          " ",
        );
  const conflict =
    configured.conflictPolicy === ProjectionConflictPolicy.IGNORE
      ? Prisma.sql`ON CONFLICT DO NOTHING`
      : Prisma.empty;

  return Prisma.sql`
    INSERT INTO ${identifier(tableName)} (
      ${Prisma.join(columns.map((field) => identifier(field.name)))}
    )
    SELECT
      ${Prisma.join(
        columns.map((field) => Prisma.sql`projected.${identifier(field.name)}`),
      )}
    FROM "LexiconStagingRecord" AS staging
    CROSS JOIN LATERAL jsonb_populate_record(
      NULL::${identifier(tableName)},
      ${patchedPayload}
    ) AS projected
    WHERE staging."publishRunId" = ${context.publishRunId}::uuid
      AND staging."collectionPath" = ${projection.collectionPath}
      ${predicateClause}
    ${conflict}
  `;
}

function dependencyOrderedProjections(): readonly ReleaseProjection[] {
  const projections = ARTIFACT_COLLECTION_MAPPINGS.flatMap(
    ({ path, targets }) =>
      targets.map((targetTable) => ({
        collectionPath: path,
        targetTable,
      })),
  );
  const projectionsByModel = new Map<string, ReleaseProjection[]>();
  for (const projection of projections) {
    const existing = projectionsByModel.get(projection.targetTable) ?? [];
    existing.push(projection);
    projectionsByModel.set(projection.targetTable, existing);
  }

  const orderedModels: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (modelName: string): void => {
    if (visited.has(modelName)) return;
    if (visiting.has(modelName)) {
      throw new Error(`ARTIFACT_PROJECTION_DEPENDENCY_CYCLE:${modelName}`);
    }
    visiting.add(modelName);
    const model = modelFor(modelName as ArtifactTargetTable);
    if (
      modelName !== PROVENANCE_EVIDENCE_MODEL &&
      model.fields.some((field) => field.name === "provenanceId") &&
      projectionsByModel.has(PROVENANCE_EVIDENCE_MODEL)
    ) {
      visit(PROVENANCE_EVIDENCE_MODEL);
    }
    for (const relation of model.fields) {
      if (
        relation.kind === "object" &&
        relation.relationFromFields?.length &&
        projectionsByModel.has(relation.type) &&
        relation.type !== modelName
      ) {
        visit(relation.type);
      }
    }
    visiting.delete(modelName);
    visited.add(modelName);
    orderedModels.push(modelName);
  };
  for (const modelName of projectionsByModel.keys()) visit(modelName);
  return orderedModels.flatMap(
    (modelName) => projectionsByModel.get(modelName) ?? [],
  );
}

export const RELEASE_PROJECTIONS = dependencyOrderedProjections();

export async function projectStagedReleaseFacts(
  transaction: SylisTransaction,
  context: ReleaseProjectionContext,
  phase: ReleaseProjectionPhase,
): Promise<void> {
  assertMappingRegistryComplete();
  await transaction.$executeRawUnsafe(STABLE_UUID_FUNCTION);
  for (const projection of RELEASE_PROJECTIONS) {
    if (phase !== releaseProjectionPhase(projection)) {
      continue;
    }
    await transaction.$executeRaw(
      buildReleaseProjectionSql(projection, context),
    );
  }
}
