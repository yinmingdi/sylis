import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaPath = join(
  workspaceRoot,
  "docs/overview/refactor/data/schemas/sylis-lexicon-artifact-v1.schema.json",
);
const examplePath = join(
  workspaceRoot,
  "docs/overview/refactor/data/examples/minimal-artifact.json",
);
const standardJsonPath = join(
  workspaceRoot,
  "docs/overview/refactor/data/standard-json.md",
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);
const validate = ajv.compile(schema);

function dereference(node) {
  if (!node.$ref) return { node, refName: null };
  const refName = node.$ref.split("/").at(-1);
  return { node: schema.$defs[refName], refName };
}

function minimumValue(input, propertyName = "") {
  const { node, refName } = dereference(input);
  if (Object.hasOwn(node, "const")) return node.const;
  if (node.enum) return node.enum[0];
  if (node.oneOf && !node.type)
    return minimumValue(node.oneOf[0], propertyName);

  if (Array.isArray(node.type)) {
    if (node.type.includes("null")) return null;
    return minimumValue({ ...node, type: node.type[0] }, propertyName);
  }

  if (node.type === "object" || node.properties) {
    const value = {};
    for (const required of node.required ?? []) {
      value[required] = minimumValue(node.properties[required], required);
    }
    if ((node.minProperties ?? 0) > Object.keys(value).length) {
      value["/lexicon/headwords"] = 0;
    }
    return value;
  }
  if (node.type === "array") {
    const count = node.minItems ?? 0;
    return Array.from({ length: count }, () => minimumValue(node.items));
  }
  if (node.type === "boolean") return false;
  if (node.type === "integer" || node.type === "number") {
    return node.minimum ?? 0;
  }
  if (node.type === "null") return null;
  if (node.type === "string") {
    if (refName === "Hash") return `sha256:${"0".repeat(64)}`;
    if (refName === "LanguageTag") return "en";
    if (node.format === "date-time") return "2026-08-04T00:00:00.000Z";
    if (node.format === "uri") return "https://example.com";
    if (node.format === "uri-reference") return "https://example.com/value";
    if (node.pattern === "^[a-f0-9]{40}$") return "0".repeat(40);
    return propertyName === "locale" ? "en" : "example";
  }
  throw new Error(
    `Cannot derive minimum value for ${propertyName || "<root>"}`,
  );
}

const generatedMinimum = minimumValue(schema);

if (process.argv.includes("--write-example")) {
  mkdirSync(dirname(examplePath), { recursive: true });
  writeFileSync(examplePath, `${JSON.stringify(generatedMinimum, null, 2)}\n`);
  console.log(`Wrote ${examplePath.slice(workspaceRoot.length + 1)}.`);
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error("Missing data/examples/minimal-artifact.json.");
  process.exit(1);
}

const example = JSON.parse(readFileSync(examplePath, "utf8"));
const canonicalGenerated = JSON.stringify(generatedMinimum);
if (JSON.stringify(example) !== canonicalGenerated) {
  console.error(
    "minimal-artifact.json is stale; regenerate it with --write-example.",
  );
  process.exit(1);
}
if (!validate(example)) {
  console.error("The minimal artifact does not satisfy Draft 2020-12 Schema:");
  console.error(ajv.errorsText(validate.errors, { separator: "\n" }));
  process.exit(1);
}

const invalidExample = structuredClone(example);
invalidExample.unknownProperty = true;
if (validate(invalidExample)) {
  console.error("Schema accepted an unknown root property.");
  process.exit(1);
}

const markdown = readFileSync(standardJsonPath, "utf8");
const jsonBlocks = [...markdown.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
for (const [index, block] of jsonBlocks.entries()) {
  try {
    JSON.parse(block[1]);
  } catch (error) {
    console.error(`standard-json.md JSON block ${index + 1}: ${error.message}`);
    process.exit(1);
  }
}

console.log(
  `Artifact Schema compiled; minimal/negative examples and ${jsonBlocks.length} documentation JSON blocks passed.`,
);
