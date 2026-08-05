import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compileLexicon, type CompileProfile } from "../compiler";
import { createCompilerGenerationFromEnv } from "./composition";
import { compilerCliExitCode } from "./exit-code";
import { validateArtifactStream } from "../export/artifact-stream-validator";
import {
  parseSourceManifest,
  resolveManifestSources,
} from "../manifest/source-manifest";
import {
  mirrorKaikkiSource,
  type KaikkiMirrorProgressEvent,
} from "../materialize/kaikki-mirror";
import {
  createS3ObjectStoragePort,
  publishContentAddressedObject,
  s3ObjectStorageConfigFromEnv,
  type ObjectPublishProgressEvent,
} from "../materialize/object-storage";
import {
  materializeSourceSlice,
  type SliceableSourceAdapter,
  type SourceSliceProgressEvent,
} from "../materialize/source-slice";
import { createConsoleProgress } from "../progress/reporter";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args: string[], name: string): string {
  const found = value(args, name);
  if (!found) throw new Error(`Missing ${name}.`);
  return found;
}

function positiveInteger(args: string[], name: string): number {
  const parsed = Number(required(args, name));
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function requiredEnvironment(name: string): string {
  const found = process.env[name];
  if (!found) throw new Error(`Missing ${name}.`);
  return found;
}

function formatBytes(value: number): string {
  const units = ["B", "KiB", "MiB", "GiB"];
  let amount = value;
  let unit = units[0]!;
  for (const candidate of units.slice(1)) {
    if (amount < 1024) break;
    amount /= 1024;
    unit = candidate;
  }
  const digits = amount >= 100 || unit === "B" ? 0 : 1;
  return `${amount.toFixed(digits)} ${unit}`;
}

function reportKaikkiMirrorProgress(event: KaikkiMirrorProgressEvent): void {
  const total = event.totalBytes === null ? "?" : formatBytes(event.totalBytes);
  const rate =
    event.bytesPerSecond === null
      ? ""
      : ` rate=${formatBytes(event.bytesPerSecond)}/s`;
  const eta = event.etaSeconds === null ? "" : ` eta=${event.etaSeconds}s`;
  process.stderr.write(
    `[lexicon-source] ${event.stage} ${formatBytes(event.downloadedBytes)}/${total}${rate}${eta}\n`,
  );
}

function reportSourceSliceProgress(event: SourceSliceProgressEvent): void {
  const total = event.totalBytes === null ? "?" : formatBytes(event.totalBytes);
  process.stderr.write(
    `[lexicon-source] ${event.stage} ${formatBytes(event.processedBytes)}/${total} matches=${event.matchedRecords}\n`,
  );
}

function reportObjectPublishProgress(event: ObjectPublishProgressEvent): void {
  process.stderr.write(
    `[lexicon-source] ${event.stage} ${formatBytes(event.processedBytes)}/${formatBytes(event.totalBytes)} reused=${event.reused}\n`,
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "compile") {
    const manifestPath = required(args, "--manifest");
    const profile = (value(args, "--profile") ?? "pilot-200") as CompileProfile;
    const outputPath =
      value(args, "--output") ?? ".work/sylis-lexicon-v1.json.zst";
    const aiEnabled = args.includes("--ai");
    const requestedAiModel = aiEnabled
      ? requiredEnvironment("LEXICON_AI_MODEL")
      : null;
    const generation = aiEnabled
      ? createCompilerGenerationFromEnv()
      : undefined;
    const result = await compileLexicon(
      {
        manifestPath,
        profile,
        outputPath,
        workRoot: value(args, "--work-root"),
        resumeRunId: value(args, "--resume"),
        ai: aiEnabled
          ? {
              enabled: true,
              budgetUsd: required(args, "--ai-budget-usd"),
              concurrency: positiveInteger(args, "--ai-concurrency"),
              pricing: {
                inputUsdPerMillion: required(
                  args,
                  "--ai-input-usd-per-million",
                ),
                outputUsdPerMillion: required(
                  args,
                  "--ai-output-usd-per-million",
                ),
                cacheHitUsdPerMillion: value(
                  args,
                  "--ai-cache-hit-usd-per-million",
                ),
              },
              promptVersion: "lexicon-enrichment-prompts/v1",
              schemaVersion: "sylis.ai-candidate/1",
              modelPolicyVersion: `compiler-ai-policy/v1:${requestedAiModel}`,
              requestedProvider: "deepseek",
              requestedModel: requestedAiModel!,
            }
          : undefined,
      },
      { structuredGeneration: generation, progress: createConsoleProgress() },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "validate") {
    const input = required(args, "--input");
    const result = await validateArtifactStream(resolve(input));
    process.stdout.write(`${JSON.stringify({ valid: true, ...result })}\n`);
    return;
  }

  if (command === "sources:fetch") {
    const manifestPath = resolve(required(args, "--manifest"));
    const manifest = parseSourceManifest(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    const sources = await resolveManifestSources(
      manifest,
      manifestPath,
      resolve(".work/lexicon-compiler"),
    );
    process.stdout.write(
      `${JSON.stringify(
        sources.map((source) => ({
          key: source.key,
          version: source.version,
          checksum: `sha256:${source.checksum}`,
        })),
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (command === "sources:slice") {
    const adapter = required(args, "--adapter") as SliceableSourceAdapter;
    if (adapter !== "ECDICT" && adapter !== "WIKTEXTRACT_EN") {
      throw new Error("--adapter must be ECDICT or WIKTEXTRACT_EN.");
    }
    const result = await materializeSourceSlice({
      adapter,
      inputPath: required(args, "--input"),
      outputPath: required(args, "--output"),
      metadataOutputPath: required(args, "--metadata-output"),
      parentUri: required(args, "--parent-uri"),
      parentSha256: required(args, "--parent-sha256"),
      headwordSetPath: required(args, "--headwords"),
      headwordSetVersion: required(args, "--headword-version"),
      headwordSetSha256: required(args, "--headword-sha256"),
      workRoot: value(args, "--work-root"),
      progress: { report: reportSourceSliceProgress },
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          ...result,
          sourceManifestInput: {
            sha256: result.output.sha256,
            materialization: {
              parentUri: result.parent.uri,
              parentSha256: result.parent.sha256,
              selectionSha256: result.selection.sha256,
              materializerVersion: result.materializerVersion,
              recordCount: result.output.recordCount,
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (command === "sources:mirror-kaikki") {
    const result = await mirrorKaikkiSource({
      metadataUrl:
        value(args, "--metadata-url") ??
        "https://kaikki.org/dictionary/rawdata.html",
      sourceUrl:
        value(args, "--source-url") ??
        "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
      mirrorRoot: required(args, "--mirror-root"),
      progress: { report: reportKaikkiMirrorProgress },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "sources:publish-object") {
    const result = await publishContentAddressedObject(
      {
        inputPath: required(args, "--input"),
        sha256: required(args, "--sha256"),
        objectName: value(args, "--object-name"),
        contentType: value(args, "--content-type"),
        progress: { report: reportObjectPublishProgress },
      },
      createS3ObjectStoragePort(s3ObjectStorageConfigFromEnv()),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  throw new Error(
    "Expected compile, validate, sources:fetch, sources:slice, sources:mirror-kaikki, or sources:publish-object command.",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = compilerCliExitCode(error);
});
