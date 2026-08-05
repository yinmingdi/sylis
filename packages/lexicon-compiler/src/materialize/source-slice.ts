import { parse } from "csv-parse";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Transform } from "node:stream";
import { finished } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { ExternalStringSorter } from "./external-sort";
import type { SourceAdapterKind } from "../candidates/candidate-v1";
import {
  headwordSelectorKey,
  parseHeadwordSet,
  sha256File,
} from "../manifest/source-manifest";
import { normalizeIdentityText } from "../normalize/text-profile";

export type SliceableSourceAdapter = Extract<
  SourceAdapterKind,
  "ECDICT" | "WIKTEXTRACT_EN"
>;

export interface SourceSliceOptions {
  adapter: SliceableSourceAdapter;
  inputPath: string;
  outputPath: string;
  metadataOutputPath: string;
  parentUri: string;
  parentSha256: string;
  headwordSetPath: string;
  headwordSetVersion: string;
  headwordSetSha256: string;
  workRoot?: string;
  progress?: SourceSliceProgressPort;
}

export type SourceSliceStage = "VERIFY_PARENT" | "SCAN" | "WRITE" | "INSTALL";

export interface SourceSliceProgressEvent {
  stage: SourceSliceStage;
  processedBytes: number;
  totalBytes: number | null;
  matchedRecords: number;
}

export interface SourceSliceProgressPort {
  report(event: SourceSliceProgressEvent): void;
}

export const silentSourceSliceProgress: SourceSliceProgressPort = {
  report: () => undefined,
};

export interface SourceSliceManifest {
  sliceManifestVersion: "sylis.source-slice/1";
  adapter: SliceableSourceAdapter;
  parent: {
    uri: string;
    sha256: string;
  };
  selection: {
    version: string;
    sha256: string;
    headwordCount: number;
    matchedHeadwordCount: number;
  };
  materializerVersion:
    | "ecdict-headword-slice/v1"
    | "wiktextract-headword-slice/v2";
  output: {
    sha256: string;
    byteSize: number;
    recordCount: number;
  };
}

interface SliceRecord {
  sortKey: string;
  outputText: string;
  identity: string;
}

interface SliceStats {
  recordCount: number;
  matchedHeadwords: Set<string>;
}

class SourceSliceProgressTracker {
  private stage: SourceSliceStage = "VERIFY_PARENT";
  private processedBytes = 0;
  private totalBytes: number | null = null;
  private matchedRecords = 0;
  private lastReportAt = 0;
  private lastReportBytes = 0;

  constructor(private readonly port: SourceSliceProgressPort) {}

  start(stage: SourceSliceStage, totalBytes: number | null): void {
    this.stage = stage;
    this.processedBytes = 0;
    this.totalBytes = totalBytes;
    if (stage === "SCAN") this.matchedRecords = 0;
    this.lastReportAt = Date.now();
    this.lastReportBytes = 0;
    this.report(true);
  }

  addBytes(bytes: number): void {
    this.processedBytes += bytes;
    this.report(false);
  }

  matched(): void {
    this.matchedRecords += 1;
    this.report(false);
  }

  complete(): void {
    this.report(true);
  }

  private report(force: boolean): void {
    const now = Date.now();
    if (
      !force &&
      now - this.lastReportAt < 5_000 &&
      this.processedBytes - this.lastReportBytes < 64 * 1024 * 1024
    ) {
      return;
    }
    this.port.report({
      stage: this.stage,
      processedBytes: this.processedBytes,
      totalBytes: this.totalBytes,
      matchedRecords: this.matchedRecords,
    });
    this.lastReportAt = now;
    this.lastReportBytes = this.processedBytes;
  }
}

function normalizeSha256(value: string, label: string): string {
  const normalized = value.replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a 64-character SHA-256 value.`);
  }
  return normalized;
}

function formatSha256(value: string): string {
  return `sha256:${value}`;
}

function stableSortKey(parts: string[]): string {
  return parts
    .map((part) => part.replaceAll("\u0000", "\u0000\u0000"))
    .join("\u0000\u0001");
}

function normalizedCsvRecord(raw: string): string {
  return `${raw.replace(/(?:\r\n|\n)$/, "")}\n`;
}

async function writeChunk(
  stream: ReturnType<typeof createWriteStream>,
  chunk: string,
): Promise<void> {
  if (stream.write(chunk)) return;
  await new Promise<void>((resolveDrain, reject) => {
    const onError = (error: Error) => {
      stream.off("drain", onDrain);
      reject(error);
    };
    const onDrain = () => {
      stream.off("error", onError);
      resolveDrain();
    };
    stream.once("error", onError);
    stream.once("drain", onDrain);
  });
}

async function writeSortedOutput(
  sorter: ExternalStringSorter,
  path: string,
  prefix: string,
  progress: SourceSliceProgressTracker,
): Promise<{ sha256: string; byteSize: number; recordCount: number }> {
  const stream = createWriteStream(path, { flags: "wx" });
  const hash = createHash("sha256");
  let byteSize = 0;
  let recordCount = 0;
  const write = async (chunk: string) => {
    hash.update(chunk);
    const chunkBytes = Buffer.byteLength(chunk);
    byteSize += chunkBytes;
    await writeChunk(stream, chunk);
    progress.addBytes(chunkBytes);
  };

  try {
    await write(prefix);
    for await (const value of sorter.values()) {
      await write(value);
      recordCount += 1;
    }
    stream.end();
    await finished(stream);
  } catch (error) {
    stream.destroy();
    throw error;
  }

  return { sha256: hash.digest("hex"), byteSize, recordCount };
}

async function sha256FileWithProgress(
  path: string,
  progress: SourceSliceProgressTracker,
): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    progress.addBytes(Buffer.byteLength(chunk));
  }
  return hash.digest("hex");
}

interface MeteredFileInput {
  stream: Transform;
  destroy(): void;
}

function meteredFileStream(
  path: string,
  progress: SourceSliceProgressTracker,
): MeteredFileInput {
  const file = createReadStream(path);
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      progress.addBytes(chunk.length);
      callback(null, chunk);
    },
  });
  file.on("error", (error) => stream.destroy(error));
  file.pipe(stream);
  return {
    stream,
    destroy() {
      file.unpipe(stream);
      stream.destroy();
      file.destroy();
    },
  };
}

async function installGeneratedFile(
  temporaryPath: string,
  destinationPath: string,
  expectedSha256: string,
): Promise<void> {
  try {
    await link(temporaryPath, destinationPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await sha256File(destinationPath)) !== expectedSha256) {
      throw new Error(
        `Refusing to replace existing output ${destinationPath}.`,
      );
    }
  }
  await unlink(temporaryPath);
}

async function collectEcdictRecords(
  inputPath: string,
  selected: Set<string>,
  sorter: ExternalStringSorter,
  progress: SourceSliceProgressTracker,
): Promise<{ header: string; stats: SliceStats }> {
  const input = meteredFileStream(inputPath, progress);
  const parser = input.stream.pipe(
    parse({
      bom: true,
      raw: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }),
  );
  let header: string | null = null;
  let wordIndex = -1;
  let recordCount = 0;
  const matchedHeadwords = new Set<string>();
  const forwardInputError = (error: Error) => parser.destroy(error);
  input.stream.on("error", forwardInputError);

  try {
    for await (const value of parser) {
      const parsed = value as { raw: string; record: unknown[] };
      if (!Array.isArray(parsed.record) || typeof parsed.raw !== "string") {
        throw new Error("ECDICT parser did not return raw CSV records.");
      }
      if (header === null) {
        const columns = parsed.record.map((column) => String(column));
        wordIndex = columns.indexOf("word");
        if (wordIndex < 0)
          throw new Error("ECDICT CSV is missing the word column.");
        header = normalizedCsvRecord(parsed.raw);
        continue;
      }

      const word = parsed.record[wordIndex];
      if (typeof word !== "string" || word.trim().length === 0) continue;
      const normalizedWord = normalizeIdentityText(word);
      const identity = headwordSelectorKey({
        languageTag: "en",
        normalizedHeadword: normalizedWord,
      });
      if (!selected.has(identity)) continue;
      const rawHash = createHash("sha256").update(parsed.raw).digest("hex");
      const record: SliceRecord = {
        sortKey: stableSortKey([normalizedWord, rawHash]),
        outputText: normalizedCsvRecord(parsed.raw),
        identity,
      };
      await sorter.add(record.sortKey, record.outputText);
      matchedHeadwords.add(record.identity);
      recordCount += 1;
      progress.matched();
    }
  } finally {
    input.stream.unpipe(parser);
    parser.destroy();
    input.destroy();
  }

  if (header === null) throw new Error("ECDICT CSV is empty.");
  return { header, stats: { recordCount, matchedHeadwords } };
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function scalarField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

interface KaikkiJsonRecord {
  text: string;
  parsed: unknown;
}

interface JsonStringState {
  inString: boolean;
  escaped: boolean;
}

function scanJsonStringState(text: string, state: JsonStringState): void {
  for (const character of text) {
    if (!state.inString) {
      if (character === '"') state.inString = true;
      continue;
    }
    if (state.escaped) {
      state.escaped = false;
      continue;
    }
    if (character === "\\") {
      state.escaped = true;
      continue;
    }
    if (character === '"') state.inString = false;
  }
}

function invalidKaikkiJsonError(
  startLine: number,
  endLine: number,
  byteLength: number,
  sha256: string,
): Error {
  const location =
    startLine === endLine
      ? `physical line ${startLine}`
      : `physical lines ${startLine}-${endLine}`;
  return new Error(
    `Kaikki source contains invalid JSON at ${location} (${byteLength} bytes, sha256:${sha256}).`,
  );
}

async function* readKaikkiJsonRecords(
  lines: AsyncIterable<string>,
): AsyncGenerator<KaikkiJsonRecord> {
  let physicalLine = 0;
  let startLine = 0;
  let text = "";
  let sourceByteLength = 0;
  let sourceHash: ReturnType<typeof createHash> | null = null;
  const state: JsonStringState = { inString: false, escaped: false };

  for await (const line of lines) {
    physicalLine += 1;
    if (sourceHash === null && line.trim().length === 0) continue;
    if (sourceHash === null) {
      startLine = physicalLine;
      sourceHash = createHash("sha256");
      state.inString = false;
      state.escaped = false;
    } else {
      sourceHash.update("\n");
      sourceByteLength += 1;
    }
    sourceHash.update(line);
    sourceByteLength += Buffer.byteLength(line);
    text += line;
    scanJsonStringState(line, state);

    if (state.inString) {
      if (state.escaped) {
        throw invalidKaikkiJsonError(
          startLine,
          physicalLine,
          sourceByteLength,
          sourceHash.digest("hex"),
        );
      }
      text += "\\n";
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw invalidKaikkiJsonError(
        startLine,
        physicalLine,
        sourceByteLength,
        sourceHash.digest("hex"),
      );
    }
    yield { text, parsed };
    text = "";
    sourceByteLength = 0;
    sourceHash = null;
  }

  if (sourceHash !== null) {
    throw invalidKaikkiJsonError(
      startLine,
      physicalLine,
      sourceByteLength,
      sourceHash.digest("hex"),
    );
  }
}

async function collectWiktextractRecords(
  inputPath: string,
  selected: Set<string>,
  sorter: ExternalStringSorter,
  progress: SourceSliceProgressTracker,
): Promise<SliceStats> {
  const input = meteredFileStream(inputPath, progress);
  const gunzip = input.stream.pipe(createGunzip());
  const forwardInputError = (error: Error) => gunzip.destroy(error);
  input.stream.on("error", forwardInputError);
  const lines = createInterface({
    input: gunzip,
    crlfDelay: Infinity,
  });
  let recordCount = 0;
  const matchedHeadwords = new Set<string>();

  try {
    for await (const { text, parsed } of readKaikkiJsonRecords(lines)) {
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Kaikki source record must be a JSON object.");
      }
      const record = parsed as Record<string, unknown>;
      if (record.lang_code !== "en") continue;
      const word = stringField(record, "word");
      if (!word)
        throw new Error("English Kaikki source record is missing word.");
      const normalizedWord = normalizeIdentityText(word);
      const identity = headwordSelectorKey({
        languageTag: "en",
        normalizedHeadword: normalizedWord,
      });
      if (!selected.has(identity)) continue;
      const rawHash = createHash("sha256").update(text).digest("hex");
      const sortKey = stableSortKey([
        normalizedWord,
        stringField(record, "pos"),
        scalarField(record, "etymology_number"),
        rawHash,
      ]);
      await sorter.add(sortKey, `${text}\n`);
      matchedHeadwords.add(identity);
      recordCount += 1;
      progress.matched();
    }
  } finally {
    lines.close();
    input.stream.unpipe(gunzip);
    gunzip.destroy();
    input.destroy();
  }

  return { recordCount, matchedHeadwords };
}

export async function materializeSourceSlice(
  options: SourceSliceOptions,
): Promise<SourceSliceManifest> {
  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(options.outputPath);
  const metadataOutputPath = resolve(options.metadataOutputPath);
  if (inputPath === outputPath || inputPath === metadataOutputPath) {
    throw new Error(
      "Source slice outputs must not overwrite the parent source.",
    );
  }
  if (outputPath === metadataOutputPath) {
    throw new Error(
      "Source slice data and metadata outputs must be different.",
    );
  }
  let parentUri: URL;
  try {
    parentUri = new URL(options.parentUri);
  } catch {
    throw new Error("Source slice parentUri must be an absolute URI.");
  }
  if (!parentUri.protocol) {
    throw new Error("Source slice parentUri must be an absolute URI.");
  }

  const progress = new SourceSliceProgressTracker(
    options.progress ?? silentSourceSliceProgress,
  );
  const inputByteSize = (await stat(inputPath)).size;
  const parentSha256 = normalizeSha256(options.parentSha256, "Parent checksum");
  progress.start("VERIFY_PARENT", inputByteSize);
  const actualParentSha256 = await sha256FileWithProgress(inputPath, progress);
  progress.complete();
  if (actualParentSha256 !== parentSha256) {
    throw new Error("Source slice parent checksum mismatch.");
  }
  const headwordSetPath = resolve(options.headwordSetPath);
  const headwordSetSha256 = normalizeSha256(
    options.headwordSetSha256,
    "Headword set checksum",
  );
  if ((await sha256File(headwordSetPath)) !== headwordSetSha256) {
    throw new Error("Source slice headword set checksum mismatch.");
  }
  const headwordSet = parseHeadwordSet(
    JSON.parse(await readFile(headwordSetPath, "utf8")),
    options.headwordSetVersion,
  );
  if (headwordSet.headwords.some((selector) => selector.languageTag !== "en")) {
    throw new Error(
      "ECDICT and Kaikki slices require English headword selectors.",
    );
  }
  const selected = new Set(headwordSet.headwords.map(headwordSelectorKey));

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(metadataOutputPath), { recursive: true });
  const workParent = resolve(options.workRoot ?? dirname(outputPath));
  await mkdir(workParent, { recursive: true });
  const workDirectory = await mkdtemp(join(workParent, ".source-slice-"));
  const sorter = new ExternalStringSorter(join(workDirectory, "sort"));
  const temporaryOutput = join(workDirectory, "slice.output");

  try {
    let stats: SliceStats;
    let prefix = "";
    let materializerVersion: SourceSliceManifest["materializerVersion"];
    progress.start("SCAN", inputByteSize);
    if (options.adapter === "ECDICT") {
      const result = await collectEcdictRecords(
        inputPath,
        selected,
        sorter,
        progress,
      );
      prefix = result.header;
      stats = result.stats;
      materializerVersion = "ecdict-headword-slice/v1";
    } else {
      stats = await collectWiktextractRecords(
        inputPath,
        selected,
        sorter,
        progress,
      );
      materializerVersion = "wiktextract-headword-slice/v2";
    }
    progress.complete();
    if (stats.recordCount < 1) {
      throw new Error("Source slice did not match any source records.");
    }
    progress.start("WRITE", null);
    const output = await writeSortedOutput(
      sorter,
      temporaryOutput,
      prefix,
      progress,
    );
    progress.complete();
    if (output.recordCount !== stats.recordCount) {
      throw new Error("Source slice record count changed during sorting.");
    }
    const manifest: SourceSliceManifest = {
      sliceManifestVersion: "sylis.source-slice/1",
      adapter: options.adapter,
      parent: {
        uri: parentUri.href,
        sha256: formatSha256(parentSha256),
      },
      selection: {
        version: headwordSet.version,
        sha256: formatSha256(headwordSetSha256),
        headwordCount: selected.size,
        matchedHeadwordCount: stats.matchedHeadwords.size,
      },
      materializerVersion,
      output: {
        sha256: formatSha256(output.sha256),
        byteSize: output.byteSize,
        recordCount: output.recordCount,
      },
    };
    const metadataBytes = `${JSON.stringify(manifest, null, 2)}\n`;
    const temporaryMetadata = join(workDirectory, "slice.metadata.json");
    await writeFile(temporaryMetadata, metadataBytes, { flag: "wx" });
    progress.start("INSTALL", output.byteSize);
    await installGeneratedFile(temporaryOutput, outputPath, output.sha256);
    await installGeneratedFile(
      temporaryMetadata,
      metadataOutputPath,
      createHash("sha256").update(metadataBytes).digest("hex"),
    );
    progress.addBytes(output.byteSize);
    progress.complete();
    return manifest;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

export async function assertSourceSliceMatchesManifest(
  slicePath: string,
  manifest: SourceSliceManifest,
): Promise<void> {
  const actualSha256 = await sha256File(resolve(slicePath));
  if (formatSha256(actualSha256) !== manifest.output.sha256) {
    throw new Error("Source slice output checksum mismatch.");
  }
  const actualSize = (await stat(resolve(slicePath))).size;
  if (actualSize !== manifest.output.byteSize) {
    throw new Error("Source slice output byte size mismatch.");
  }
}
