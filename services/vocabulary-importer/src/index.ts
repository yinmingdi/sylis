import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { pathToFileURL } from "node:url";

import { materializeEcdictBooks } from "./books.js";
import { EcdictBulkImporter, type StagedWord } from "./bulk-import.js";
import {
  ECDICT_SHA256,
  ECDICT_URL,
  type EcdictRow,
  type ImportScope,
  selectEcdictRow,
} from "./ecdict.js";

interface ImportOptions {
  source: string;
  checksum: string;
  dryRun: boolean;
  limit?: number;
  scope: ImportScope;
  materializeBooks: boolean;
  expectedSelected?: number;
}

interface ImportStats {
  selected: number;
  inserted: number;
  updated: number;
  skipped: number;
  relations: number;
  books: number;
}

interface ProgressFields {
  state?: "started" | "running" | "retrying" | "completed";
  attempt?: number;
  maxAttempts?: number;
  processed?: number;
  total?: number;
  selected?: number;
  skipped?: number;
  processedBytes?: number;
  totalBytes?: number;
  percent?: number;
  bookId?: string;
  wordCount?: number;
}

type ProgressReporter = (phase: string, fields?: ProgressFields) => void;

const ROW_PROGRESS_INTERVAL = 25_000;
const BYTE_PROGRESS_INTERVAL = 8 * 1024 * 1024;
const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 45_000;

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(args: string[]): ImportOptions {
  const options: ImportOptions = {
    source: process.env.ECDICT_SOURCE_URL || ECDICT_URL,
    checksum: (process.env.ECDICT_SHA256 || ECDICT_SHA256).toLowerCase(),
    dryRun: process.env.ECDICT_DRY_RUN === "true",
    limit: process.env.ECDICT_LIMIT
      ? Number(process.env.ECDICT_LIMIT)
      : undefined,
    scope: process.env.ECDICT_SCOPE === "learning" ? "learning" : "all",
    materializeBooks: process.env.ECDICT_MATERIALIZE_BOOKS !== "false",
    expectedSelected: process.env.ECDICT_EXPECTED_SELECTED
      ? Number(process.env.ECDICT_EXPECTED_SELECTED)
      : undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--source") {
      options.source = readValue(args, index, flag);
      index += 1;
    } else if (flag === "--sha256") {
      options.checksum = readValue(args, index, flag).toLowerCase();
      index += 1;
    } else if (flag === "--limit") {
      options.limit = Number(readValue(args, index, flag));
      index += 1;
    } else if (flag === "--expected-selected") {
      options.expectedSelected = Number(readValue(args, index, flag));
      index += 1;
    } else if (flag === "--scope") {
      const scope = readValue(args, index, flag);
      if (scope !== "learning" && scope !== "all")
        throw new Error("--scope must be either learning or all");
      options.scope = scope;
      index += 1;
    } else if (flag === "--no-books") options.materializeBooks = false;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  )
    throw new Error("--limit must be a positive integer");
  if (
    options.expectedSelected !== undefined &&
    (!Number.isInteger(options.expectedSelected) ||
      options.expectedSelected < 1)
  )
    throw new Error("--expected-selected must be a positive integer");
  if (!/^[a-f0-9]{64}$/.test(options.checksum))
    throw new Error("--sha256 must be a 64-character hexadecimal digest");
  return options;
}

async function downloadSource(
  source: string,
  filePath: string,
  attempt: number,
  report: ProgressReporter,
) {
  const controller = new AbortController();
  let processedBytes = 0;
  let totalBytes: number | undefined;
  let inactivityTimeout: NodeJS.Timeout | undefined;
  const resetInactivityTimeout = () => {
    if (inactivityTimeout) clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
      controller.abort(
        new Error(
          `ECDICT download received no data for ${DOWNLOAD_INACTIVITY_TIMEOUT_MS / 1_000} seconds`,
        ),
      );
    }, DOWNLOAD_INACTIVITY_TIMEOUT_MS);
    inactivityTimeout.unref();
  };
  const progressFields = (): ProgressFields => ({
    attempt,
    maxAttempts: DOWNLOAD_ATTEMPTS,
    processedBytes,
    totalBytes,
  });
  const heartbeat = setInterval(() => {
    report("download", { state: "running", ...progressFields() });
  }, 15_000);
  heartbeat.unref();
  report("download", { state: "started", ...progressFields() });
  resetInactivityTimeout();

  try {
    const response = await fetch(source, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`ECDICT download failed with HTTP ${response.status}`);
    if (!response.body)
      throw new Error("ECDICT download returned an empty body");

    const contentLength = Number(response.headers.get("content-length"));
    totalBytes = Number.isFinite(contentLength) ? contentLength : undefined;
    const destination = createWriteStream(filePath, { flags: "wx" });
    const reader = response.body.getReader();
    let lastReportedBytes = 0;
    let lastReportedAt = Date.now();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetInactivityTimeout();
        const chunk = Buffer.from(value);
        if (!destination.write(chunk)) await once(destination, "drain");
        processedBytes += chunk.byteLength;
        if (
          processedBytes - lastReportedBytes >= BYTE_PROGRESS_INTERVAL ||
          Date.now() - lastReportedAt >= 5_000
        ) {
          report("download", { state: "running", ...progressFields() });
          lastReportedBytes = processedBytes;
          lastReportedAt = Date.now();
        }
      }
      destination.end();
      await finished(destination);
    } catch (error) {
      destination.destroy();
      throw error;
    } finally {
      reader.releaseLock();
    }
    report("download", { state: "completed", ...progressFields() });
  } finally {
    if (inactivityTimeout) clearTimeout(inactivityTimeout);
    clearInterval(heartbeat);
  }
}

async function resolveSource(source: string, report: ProgressReporter) {
  if (!source.startsWith("http://") && !source.startsWith("https://"))
    return {
      filePath: source,
      cleanup: async () => undefined,
    };
  const directory = await mkdtemp(join(tmpdir(), "sylis-ecdict-"));
  const filePath = join(directory, "ecdict.csv");
  try {
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
      try {
        await downloadSource(source, filePath, attempt, report);
        return {
          filePath,
          cleanup: () => rm(directory, { recursive: true, force: true }),
        };
      } catch (error) {
        await rm(filePath, { force: true });
        if (attempt === DOWNLOAD_ATTEMPTS) throw error;
        report("download", {
          state: "retrying",
          attempt,
          maxAttempts: DOWNLOAD_ATTEMPTS,
        });
      }
    }
    throw new Error("ECDICT download exhausted all retry attempts");
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function sha256(filePath: string, report: ProgressReporter) {
  const totalBytes = (await stat(filePath)).size;
  const hash = createHash("sha256");
  let processedBytes = 0;
  let lastReportedBytes = 0;
  let lastReportedAt = Date.now();
  report("checksum", { state: "started", processedBytes, totalBytes });
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
    processedBytes += (chunk as Buffer).byteLength;
    if (
      processedBytes - lastReportedBytes >= BYTE_PROGRESS_INTERVAL ||
      Date.now() - lastReportedAt >= 5_000
    ) {
      report("checksum", {
        state: "running",
        processedBytes,
        totalBytes,
      });
      lastReportedBytes = processedBytes;
      lastReportedAt = Date.now();
    }
  }
  report("checksum", { state: "completed", processedBytes, totalBytes });
  return hash.digest("hex");
}

async function scanFile(
  filePath: string,
  options: ImportOptions,
  report: ProgressReporter,
) {
  const stats: ImportStats = {
    selected: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    relations: 0,
    books: 0,
  };
  const parser = createReadStream(filePath).pipe(
    parse({
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }),
  );
  let processed = 0;
  report("preflight-scan", {
    state: "started",
    processed,
    total: options.expectedSelected,
    selected: stats.selected,
    skipped: stats.skipped,
  });
  for await (const raw of parser) {
    processed += 1;
    const selected = selectEcdictRow(raw as EcdictRow, options.scope);
    if (!selected) {
      stats.skipped += 1;
      if (processed % ROW_PROGRESS_INTERVAL === 0)
        report("preflight-scan", {
          state: "running",
          processed,
          total: options.expectedSelected,
          selected: stats.selected,
          skipped: stats.skipped,
        });
      continue;
    }
    stats.selected += 1;
    if (processed % ROW_PROGRESS_INTERVAL === 0)
      report("preflight-scan", {
        state: "running",
        processed,
        total: options.expectedSelected,
        selected: stats.selected,
        skipped: stats.skipped,
      });
    if (options.limit !== undefined && stats.selected >= options.limit) break;
  }
  report("preflight-scan", {
    state: "completed",
    processed,
    total: options.expectedSelected,
    selected: stats.selected,
    skipped: stats.skipped,
  });
  return stats;
}

async function* stagedWords(
  filePath: string,
  options: ImportOptions,
): AsyncGenerator<StagedWord> {
  const parser = createReadStream(filePath).pipe(
    parse({
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }),
  );
  let sourceOrder = 0;
  for await (const raw of parser) {
    const record = selectEcdictRow(raw as EcdictRow, options.scope);
    if (!record) continue;
    yield {
      sourceOrder,
      record,
      payloadHash: createHash("sha256")
        .update(JSON.stringify(record))
        .digest("hex"),
    };
    sourceOrder += 1;
    if (options.limit !== undefined && sourceOrder >= options.limit) break;
  }
}

export function validatePreflight(
  stats: Pick<ImportStats, "selected" | "skipped">,
  expectedSelected?: number,
) {
  if (expectedSelected === undefined) return;
  if (stats.selected !== expectedSelected || stats.skipped !== 0)
    throw new Error(
      `ECDICT preflight expected ${expectedSelected} selected and 0 skipped rows; received ${stats.selected} selected and ${stats.skipped} skipped`,
    );
}

async function run() {
  const startedAt = Date.now();
  const report: ProgressReporter = (phase, fields = {}) => {
    const processed = fields.processed ?? fields.processedBytes;
    const total = fields.total ?? fields.totalBytes;
    const percent =
      processed !== undefined && total !== undefined && total > 0
        ? Math.min(100, Number(((processed / total) * 100).toFixed(2)))
        : undefined;
    console.log(
      JSON.stringify({
        mode: "progress",
        phase,
        elapsedMs: Date.now() - startedAt,
        ...fields,
        percent: fields.percent ?? percent,
      }),
    );
  };
  const options = parseArguments(process.argv.slice(2));
  const source = await resolveSource(options.source, report);
  try {
    const actualChecksum = await sha256(source.filePath, report);
    if (actualChecksum !== options.checksum)
      throw new Error(
        "ECDICT checksum mismatch; refusing to import unverified data",
      );
    const preflight = await scanFile(source.filePath, options, report);
    validatePreflight(preflight, options.expectedSelected);
    if (options.dryRun) {
      console.log(
        JSON.stringify({
          mode: "dry-run",
          checksum: actualChecksum,
          ...preflight,
        }),
      );
      return;
    }
    console.log(
      JSON.stringify({
        mode: "preflight",
        checksum: actualChecksum,
        ...preflight,
      }),
    );
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is required for a real import");
    const prisma = new PrismaClient();
    const importer = new EcdictBulkImporter(
      process.env.DATABASE_URL,
      (progress) => {
        console.log(JSON.stringify(progress));
      },
      startedAt,
    );
    try {
      await importer.open(actualChecksum, options.scope);
      const staged = await importer.stage(
        stagedWords(source.filePath, options),
        preflight.selected,
      );
      if (staged !== preflight.selected) {
        throw new Error(
          `ECDICT staging expected ${preflight.selected} rows; received ${staged}`,
        );
      }
      const stats = await importer.materialize(actualChecksum);
      if (options.materializeBooks) {
        report("materialize-books", { state: "started" });
        const heartbeat = setInterval(() => {
          report("materialize-books", { state: "running" });
        }, 15_000);
        heartbeat.unref();
        try {
          stats.books = await materializeEcdictBooks(prisma, (progress) => {
            report("materialize-books", {
              state: "running",
              ...progress,
            });
          });
          report("materialize-books", {
            state: "completed",
            processed: stats.books,
            total: stats.books,
          });
        } finally {
          clearInterval(heartbeat);
        }
      }
      await importer.complete(stats);
      console.log(
        JSON.stringify({ mode: "import", checksum: actualChecksum, ...stats }),
      );
    } catch (error) {
      await importer.fail(error);
      throw error;
    } finally {
      await prisma.$disconnect();
      await importer.close();
    }
  } finally {
    await source.cleanup();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Vocabulary import failed",
    );
    process.exitCode = 1;
  });
}
