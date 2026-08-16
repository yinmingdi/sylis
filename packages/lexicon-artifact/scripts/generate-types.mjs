import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "json-schema-to-typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(
  packageRoot,
  "schema/sylis-lexicon-artifact-v1.schema.json",
);
const outputPath = resolve(packageRoot, "src/types/artifact-v1.ts");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const output = await compile(schema, "SylisLexiconArtifactV1", {
  bannerComment:
    "/* Generated from sylis-lexicon-artifact-v1.schema.json. Do not edit. */",
  style: {
    bracketSpacing: true,
    printWidth: 80,
    semi: true,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "all",
    useTabs: false,
  },
  unreachableDefinitions: true,
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output);
