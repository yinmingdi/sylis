import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

type Relation = {
  fields: string[];
  name: string;
  target: string;
};

type SchemaModel = {
  file: string;
  name: string;
  relations: Relation[];
  releaseScoped: boolean;
};

const schemaDirectory = resolve(__dirname, "../prisma/schema");
const models = readSchemaModels(schemaDirectory);
const lexiconReleaseSemanticExceptions = new Set(["AgentReleaseEvent"]);
const directReleaseRoots = [
  "AssessmentBlueprintRevision",
  "AssessmentStimulusRevision",
  "ContentProfileEvaluation",
  "ExampleSentence",
  "LearningObjectiveRevision",
  "MediaAsset",
  "PedagogicalMaterialRevision",
  "PublishRun",
  "ReleaseQualityStatistic",
  "ValidationIssue",
] as const;

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describe("Lexicon release scope schema", () => {
  it("keeps every relation between release-scoped models composite", () => {
    const violations: string[] = [];
    for (const model of models.values()) {
      if (
        !model.releaseScoped ||
        lexiconReleaseSemanticExceptions.has(model.name)
      ) {
        continue;
      }
      for (const relation of model.relations) {
        const target = models.get(relation.target);
        if (
          relation.fields.length > 0 &&
          target?.releaseScoped &&
          !lexiconReleaseSemanticExceptions.has(target.name) &&
          !relation.fields.includes("releaseId")
        ) {
          violations.push(
            `${model.file}:${model.name}.${relation.name} -> ${relation.target}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("gives every Lexicon release-scoped model an FK path to LexiconRelease", () => {
    const unreachable = [...models.values()]
      .filter(
        (model) =>
          model.releaseScoped &&
          !lexiconReleaseSemanticExceptions.has(model.name),
      )
      .filter((model) => !reachesLexiconRelease(model.name, models))
      .map((model) => `${model.file}:${model.name}`)
      .sort();

    expect(unreachable).toEqual([]);
  });

  it("anchors all independent release roots directly", () => {
    for (const modelName of directReleaseRoots) {
      const model = models.get(modelName);
      expect(model, `${modelName} is missing`).toBeDefined();
      expect(
        model!.relations.some(
          (relation) =>
            relation.target === "LexiconRelease" &&
            relation.fields.length === 1 &&
            relation.fields[0] === "releaseId",
        ),
        `${modelName} must directly reference LexiconRelease`,
      ).toBe(true);
    }
  });

  it("documents the only non-Lexicon releaseId semantic exception", () => {
    expect([...lexiconReleaseSemanticExceptions]).toEqual([
      "AgentReleaseEvent",
    ]);
    const event = models.get("AgentReleaseEvent");
    expect(event?.releaseScoped).toBe(true);
    expect(event?.relations).toEqual([]);
  });
});

describeDatabase("Lexicon release scope foreign keys", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("rejects independent release facts for a missing LexiconRelease", async () => {
    const missingReleaseId = randomUUID();
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ReleaseQualityStatistic" (
           "id", "releaseId", "category", "key", "count"
         ) VALUES ($1::uuid, $2::uuid, 'TEST', 'orphan', 1)`,
        randomUUID(),
        missingReleaseId,
      ),
    ).rejects.toThrow(/foreign key constraint/i);

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ValidationIssue" (
           "id", "releaseId", "severity", "ruleCode", "message", "evidence"
         ) VALUES ($1::uuid, $2::uuid, 'ERROR', 'ORPHAN', 'orphan release', '{}'::jsonb)`,
        randomUUID(),
        missingReleaseId,
      ),
    ).rejects.toThrow(/foreign key constraint/i);
  });
});

function readSchemaModels(directory: string): Map<string, SchemaModel> {
  const parsed = new Map<string, SchemaModel>();
  for (const file of readdirSync(directory).filter((entry) =>
    entry.endsWith(".prisma"),
  )) {
    const source = readFileSync(resolve(directory, file), "utf8");
    for (const match of source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
      const [, name, body] = match;
      if (!name || body === undefined) continue;
      const relations: Relation[] = [];
      for (const line of body.split("\n")) {
        const relation =
          /^\s*(\w+)\s+([A-Za-z]\w*)[?\[\]]*\s+@relation\((.*)\)/.exec(line);
        if (!relation) continue;
        const fieldList = /fields:\s*\[([^\]]+)\]/.exec(relation[3] ?? "");
        relations.push({
          fields: fieldList
            ? fieldList[1]!.split(",").map((field) => field.trim())
            : [],
          name: relation[1]!,
          target: relation[2]!,
        });
      }
      parsed.set(name, {
        file,
        name,
        relations,
        releaseScoped: /^\s*releaseId\s+/m.test(body),
      });
    }
  }
  return parsed;
}

function reachesLexiconRelease(
  modelName: string,
  schemaModels: ReadonlyMap<string, SchemaModel>,
  visited = new Set<string>(),
): boolean {
  if (modelName === "LexiconRelease") return true;
  if (visited.has(modelName)) return false;
  visited.add(modelName);
  const model = schemaModels.get(modelName);
  if (!model) return false;

  return model.relations.some(
    (relation) =>
      relation.fields.includes("releaseId") &&
      reachesLexiconRelease(relation.target, schemaModels, new Set(visited)),
  );
}
