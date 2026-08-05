import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  statfs,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

import { sha256File } from "../manifest/source-manifest";

export interface KaikkiVersionIdentity {
  dumpDate: string;
  extractionDate: string;
  wiktextractCommit: string;
  wikitextprocessorCommit: string;
}

export interface KaikkiMirrorOptions {
  metadataUrl: string;
  sourceUrl: string;
  mirrorRoot: string;
  progress?: KaikkiMirrorProgressPort;
}

export type KaikkiMirrorStage =
  | "METADATA_BEFORE"
  | "DOWNLOAD"
  | "METADATA_AFTER"
  | "INSTALL";

export interface KaikkiMirrorProgressEvent {
  stage: KaikkiMirrorStage;
  downloadedBytes: number;
  totalBytes: number | null;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
}

export interface KaikkiMirrorProgressPort {
  report(event: KaikkiMirrorProgressEvent): void;
}

export const silentKaikkiMirrorProgress: KaikkiMirrorProgressPort = {
  report: () => undefined,
};

export interface KaikkiMirrorResult {
  mirrorManifestVersion: "sylis.kaikki-mirror/1";
  originUri: string;
  mirrorUri: string;
  sha256: string;
  byteSize: number;
  version: KaikkiVersionIdentity;
  response: {
    contentLength: number | null;
    etag: string | null;
    lastModified: string | null;
  };
}

function requiredMatch(html: string, pattern: RegExp, label: string): string {
  const match = html.match(pattern)?.[1];
  if (!match) throw new Error(`Kaikki metadata is missing ${label}.`);
  return match;
}

export function parseKaikkiVersionIdentity(
  html: string,
): KaikkiVersionIdentity {
  return {
    dumpDate: requiredMatch(
      html,
      /enwiktionary dump<\/a> dated (\d{4}-\d{2}-\d{2})/i,
      "dump date",
    ),
    extractionDate: requiredMatch(
      html,
      /structured data extracted on (\d{4}-\d{2}-\d{2})/i,
      "extraction date",
    ),
    wiktextractCommit: requiredMatch(
      html,
      /github\.com\/tatuylonen\/wiktextract\/commit\/([a-f0-9]{40})/i,
      "Wiktextract commit",
    ).toLowerCase(),
    wikitextprocessorCommit: requiredMatch(
      html,
      /github\.com\/tatuylonen\/wikitextprocessor\/commit\/([a-f0-9]{40})/i,
      "wikitextprocessor commit",
    ).toLowerCase(),
  };
}

async function fetchVersion(
  metadataUrl: string,
): Promise<KaikkiVersionIdentity> {
  const response = await fetch(metadataUrl, {
    headers: { accept: "text/html", "cache-control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(
      `Kaikki metadata request failed with HTTP ${response.status}.`,
    );
  }
  return parseKaikkiVersionIdentity(await response.text());
}

function equalVersion(
  left: KaikkiVersionIdentity,
  right: KaikkiVersionIdentity,
): boolean {
  return (
    left.dumpDate === right.dumpDate &&
    left.extractionDate === right.extractionDate &&
    left.wiktextractCommit === right.wiktextractCommit &&
    left.wikitextprocessorCommit === right.wikitextprocessorCommit
  );
}

function progressEvent(
  stage: KaikkiMirrorStage,
  downloadedBytes: number,
  totalBytes: number | null,
  startedAt: number,
): KaikkiMirrorProgressEvent {
  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1_000, 0);
  const bytesPerSecond =
    stage === "DOWNLOAD" && downloadedBytes > 0 && elapsedSeconds > 0
      ? Math.round(downloadedBytes / elapsedSeconds)
      : null;
  const remainingBytes =
    totalBytes === null ? null : Math.max(totalBytes - downloadedBytes, 0);
  const etaSeconds =
    remainingBytes !== null && bytesPerSecond !== null && bytesPerSecond > 0
      ? Math.ceil(remainingBytes / bytesPerSecond)
      : null;
  return {
    stage,
    downloadedBytes,
    totalBytes,
    bytesPerSecond,
    etaSeconds,
  };
}

async function assertGzip(path: string): Promise<void> {
  const stream = createReadStream(path, { start: 0, end: 1 });
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const magic = Buffer.concat(chunks);
  if (magic.length !== 2 || magic[0] !== 0x1f || magic[1] !== 0x8b) {
    throw new Error("Kaikki mirror download is not a gzip stream.");
  }
}

async function installContentAddressedFile(
  temporaryPath: string,
  finalPath: string,
  sha256: string,
): Promise<void> {
  await mkdir(dirname(finalPath), { recursive: true });
  try {
    await link(temporaryPath, finalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await sha256File(finalPath)) !== sha256) {
      throw new Error(
        "Existing Kaikki mirror object failed checksum validation.",
      );
    }
  }
  await unlink(temporaryPath);
}

export async function mirrorKaikkiSource(
  options: KaikkiMirrorOptions,
): Promise<KaikkiMirrorResult> {
  const metadataUrl = new URL(options.metadataUrl).href;
  const sourceUrl = new URL(options.sourceUrl).href;
  const mirrorRoot = resolve(options.mirrorRoot);
  await mkdir(mirrorRoot, { recursive: true });
  const workDirectory = await mkdtemp(join(mirrorRoot, ".download-"));
  const temporaryPath = join(workDirectory, "raw-wiktextract-data.jsonl.gz");
  const progress = options.progress ?? silentKaikkiMirrorProgress;
  const startedAt = Date.now();

  try {
    progress.report(progressEvent("METADATA_BEFORE", 0, null, startedAt));
    const before = await fetchVersion(metadataUrl);
    const response = await fetch(sourceUrl, {
      headers: { accept: "application/gzip", "cache-control": "no-cache" },
    });
    if (!response.ok || !response.body) {
      throw new Error(`Kaikki download failed with HTTP ${response.status}.`);
    }
    const declaredLength = response.headers.get("content-length");
    const contentLength =
      declaredLength === null ? null : Number(declaredLength);
    if (
      contentLength !== null &&
      (!Number.isSafeInteger(contentLength) || contentLength < 1)
    ) {
      throw new Error("Kaikki response has an invalid Content-Length.");
    }
    if (contentLength !== null) {
      const filesystem = await statfs(mirrorRoot);
      const availableBytes = filesystem.bavail * filesystem.bsize;
      const requiredBytes = contentLength + 512 * 1024 * 1024;
      if (availableBytes < requiredBytes) {
        await response.body.cancel();
        throw new Error(
          `Kaikki mirror requires ${requiredBytes} free bytes but only ${availableBytes} are available.`,
        );
      }
    }
    const hash = createHash("sha256");
    let byteSize = 0;
    let lastProgressAt = Date.now();
    let lastProgressBytes = 0;
    const reportDownload = (force = false) => {
      const now = Date.now();
      if (
        !force &&
        now - lastProgressAt < 5_000 &&
        byteSize - lastProgressBytes < 64 * 1024 * 1024
      ) {
        return;
      }
      progress.report(
        progressEvent("DOWNLOAD", byteSize, contentLength, startedAt),
      );
      lastProgressAt = now;
      lastProgressBytes = byteSize;
    };
    reportDownload(true);
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        byteSize += chunk.length;
        reportDownload();
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
      meter,
      createWriteStream(temporaryPath, { flags: "wx" }),
    );
    reportDownload(true);
    if (contentLength !== null && byteSize !== contentLength) {
      throw new Error(
        "Kaikki download byte count does not match Content-Length.",
      );
    }
    await assertGzip(temporaryPath);
    progress.report(
      progressEvent("METADATA_AFTER", byteSize, contentLength, startedAt),
    );
    const after = await fetchVersion(metadataUrl);
    if (!equalVersion(before, after)) {
      throw new Error(
        "Kaikki version changed while the source was downloading.",
      );
    }

    const digest = hash.digest("hex");
    const objectDirectory = join(mirrorRoot, "sha256", digest);
    const finalPath = join(objectDirectory, "raw-wiktextract-data.jsonl.gz");
    progress.report(
      progressEvent("INSTALL", byteSize, contentLength, startedAt),
    );
    await installContentAddressedFile(temporaryPath, finalPath, digest);
    const result: KaikkiMirrorResult = {
      mirrorManifestVersion: "sylis.kaikki-mirror/1",
      originUri: sourceUrl,
      mirrorUri: pathToFileURL(finalPath).href,
      sha256: `sha256:${digest}`,
      byteSize,
      version: before,
      response: {
        contentLength,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      },
    };
    const metadataPath = join(objectDirectory, "acquisition.json");
    try {
      await writeFile(metadataPath, `${JSON.stringify(result, null, 2)}\n`, {
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = JSON.parse(
        await readFile(metadataPath, "utf8"),
      ) as KaikkiMirrorResult;
      if (
        existing.sha256 !== result.sha256 ||
        existing.byteSize !== byteSize ||
        existing.originUri !== result.originUri ||
        JSON.stringify(existing.version) !== JSON.stringify(result.version)
      ) {
        throw new Error(
          "Existing Kaikki acquisition metadata is inconsistent.",
        );
      }
      return existing;
    }
    return result;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
