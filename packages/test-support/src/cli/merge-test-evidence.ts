import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  type ExecutedTestsManifest,
  type PlannedTestsManifest,
  mergeExecutedTestsManifests,
  mergePlannedTestsManifests,
} from "../coverage-execution";

enum EvidenceManifestKind {
  PLANNED = "planned",
  EXECUTED = "executed",
}

export function main(args = process.argv.slice(2)): number {
  try {
    const options = parseArguments(args);
    const value =
      options.kind === EvidenceManifestKind.PLANNED
        ? mergePlannedTestsManifests(
            options.inputs.map((path) => readJson<PlannedTestsManifest>(path)),
          )
        : mergeExecutedTestsManifests(
            options.inputs.map((path) => readJson<ExecutedTestsManifest>(path)),
          );
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(
      options.output,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `Merged ${value.tests.length} ${options.kind} test records.\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

interface CliOptions {
  kind: EvidenceManifestKind;
  inputs: string[];
  output: string;
}

function parseArguments(args: readonly string[]): CliOptions {
  const values = new Map<string, string[]>();
  for (const argument of args) {
    if (argument === "--") continue;
    const separator = argument.indexOf("=");
    if (!argument.startsWith("--") || separator < 3) {
      throw new Error(`INVALID_ARGUMENT:${argument}`);
    }
    const key = argument.slice(2, separator);
    const list = values.get(key) ?? [];
    list.push(argument.slice(separator + 1));
    values.set(key, list);
  }
  const rawKind = values.get("kind")?.at(-1);
  if (
    !Object.values(EvidenceManifestKind).includes(
      rawKind as EvidenceManifestKind,
    )
  ) {
    throw new Error("EVIDENCE_MANIFEST_KIND_REQUIRED");
  }
  const inputs = values.get("input")?.map((path) => resolve(path)) ?? [];
  if (inputs.length === 0) throw new Error("EVIDENCE_INPUT_REQUIRED");
  const output = values.get("output")?.at(-1);
  if (!output) throw new Error("EVIDENCE_OUTPUT_REQUIRED");
  return {
    kind: rawKind as EvidenceManifestKind,
    inputs,
    output: resolve(output),
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

if (require.main === module) {
  process.exitCode = main();
}
