import {
  AssetLanguageCode,
  AssetMimeType,
  AssetParserKind,
  AssetProcessingResultKind,
  AssetScanStatus,
  type AssetLexicalIndexResult,
  type AssetScanAcceptedResult,
  type AssetTextExtractionResult,
} from "@sylis/agent-contracts";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, posix } from "node:path";
import * as yauzl from "yauzl";

const VALIDATOR_VERSION = "sylis-safe-content/1";
const TEXT_PARSER_VERSION = "sylis-text-extractor/1";
const TOKENIZER_VERSION = "sylis-unicode-lexical/1";

export interface ContentProcessingLimits {
  maxAssetBytes: number;
  maxArchiveEntries: number;
  maxArchiveEntryBytes: number;
  maxArchiveExpandedBytes: number;
  maxArchiveCompressionRatio: number;
  maxDocumentPages: number;
  maxImagePixels: number;
  maxExtractedCharacters: number;
  parserTimeoutMs: number;
}

interface ArchiveEntry {
  body: Buffer;
  compressionMethod: number;
}

interface SafeArchive {
  entries: ReadonlyMap<string, ArchiveEntry>;
  firstEntry: string;
}

export async function inspectAsset(
  body: Buffer,
  declaredMimeType: AssetMimeType,
  limits: ContentProcessingLimits,
): Promise<Omit<AssetScanAcceptedResult, "scannerVersion">> {
  assertSize(body, limits.maxAssetBytes);
  const detectedMimeType = await detectMimeType(body, declaredMimeType, limits);
  assertCompatibleMimeType(declaredMimeType, detectedMimeType);
  const dimensions = isImage(detectedMimeType)
    ? imageDimensions(body, detectedMimeType)
    : undefined;
  if (dimensions) assertPixelLimit(dimensions, limits.maxImagePixels);
  const pageCount =
    detectedMimeType === AssetMimeType.PDF
      ? await pdfPageCount(body, limits)
      : undefined;
  if (detectedMimeType === AssetMimeType.DOCX) {
    assertDocx(await readSafeArchive(body, limits));
  }
  if (detectedMimeType === AssetMimeType.EPUB) {
    assertEpub(await readSafeArchive(body, limits));
  }
  return {
    resultKind: AssetProcessingResultKind.SCAN,
    status: AssetScanStatus.READY,
    detectedMimeType,
    validatorVersion: VALIDATOR_VERSION,
    ...(pageCount === undefined ? {} : { pageCount }),
    ...(dimensions === undefined
      ? {}
      : { pixelWidth: dimensions.width, pixelHeight: dimensions.height }),
  };
}

export async function extractText(
  body: Buffer,
  mimeType: AssetMimeType,
  limits: ContentProcessingLimits,
): Promise<AssetTextExtractionResult> {
  assertSize(body, limits.maxAssetBytes);
  let text: string;
  let parser: AssetParserKind;
  let pageCount: number | undefined;
  switch (mimeType) {
    case AssetMimeType.TEXT_PLAIN:
    case AssetMimeType.TEXT_MARKDOWN:
      text = decodeText(body);
      parser = AssetParserKind.PLAIN_TEXT;
      break;
    case AssetMimeType.APPLICATION_JSON:
      text = decodeText(body);
      assertJson(text);
      parser = AssetParserKind.JSON;
      break;
    case AssetMimeType.PDF:
      pageCount = await pdfPageCount(body, limits);
      text = await runFileTool(
        body,
        ".pdf",
        "pdftotext",
        (path) => ["-enc", "UTF-8", "-nopgbrk", path, "-"],
        limits,
      );
      parser = AssetParserKind.PDF;
      break;
    case AssetMimeType.DOCX:
      text = extractDocx(await readSafeArchive(body, limits));
      parser = AssetParserKind.DOCX;
      break;
    case AssetMimeType.EPUB:
      text = extractEpub(await readSafeArchive(body, limits));
      parser = AssetParserKind.EPUB;
      break;
    default:
      throw new Error("ASSET_TEXT_EXTRACTION_UNSUPPORTED");
  }
  text = normalizeExtractedText(text, limits.maxExtractedCharacters);
  return {
    resultKind: AssetProcessingResultKind.TEXT_EXTRACTION,
    text,
    parser,
    parserVersion: TEXT_PARSER_VERSION,
    language: detectLanguage(text),
    ...(pageCount === undefined ? {} : { pageCount }),
  };
}

export async function extractImageText(
  body: Buffer,
  mimeType: AssetMimeType,
  limits: ContentProcessingLimits,
): Promise<AssetTextExtractionResult> {
  if (!isImage(mimeType)) throw new Error("ASSET_OCR_IMAGE_REQUIRED");
  const dimensions = imageDimensions(body, mimeType);
  assertPixelLimit(dimensions, limits.maxImagePixels);
  const text = normalizeExtractedText(
    await runFileTool(
      body,
      extensionFor(mimeType),
      "tesseract",
      (path) => [path, "stdout", "--dpi", "300", "-l", "eng", "--psm", "6"],
      limits,
    ),
    limits.maxExtractedCharacters,
  );
  return {
    resultKind: AssetProcessingResultKind.TEXT_EXTRACTION,
    text,
    parser: AssetParserKind.IMAGE_OCR,
    parserVersion: `${TEXT_PARSER_VERSION}+tesseract`,
    language: detectLanguage(text),
  };
}

export function buildLexicalIndex(text: string): AssetLexicalIndexResult {
  const terms = new Map<
    string,
    { surfaces: Set<string>; count: number; firstOffset: number }
  >();
  let tokenCount = 0;
  for (const match of text.matchAll(/\p{L}+(?:['\u2019-]\p{L}+)?/gu)) {
    const surface = match[0];
    const normalized = surface.normalize("NFKC").toLocaleLowerCase("en-US");
    if (normalized.length > 64) continue;
    tokenCount += 1;
    const current = terms.get(normalized);
    if (current) {
      current.count += 1;
      if (current.surfaces.size < 8) current.surfaces.add(surface);
    } else if (terms.size < 50_000) {
      terms.set(normalized, {
        surfaces: new Set([surface]),
        count: 1,
        firstOffset: match.index,
      });
    }
  }
  return {
    resultKind: AssetProcessingResultKind.LEXICAL_INDEX,
    language: detectLanguage(text),
    tokenCount,
    terms: [...terms.entries()]
      .map(([normalized, value]) => ({
        normalized,
        surfaceForms: [...value.surfaces].sort(),
        count: value.count,
        firstOffset: value.firstOffset,
      }))
      .sort((left, right) => left.firstOffset - right.firstOffset),
    tokenizerVersion: TOKENIZER_VERSION,
  };
}

async function detectMimeType(
  body: Buffer,
  declared: AssetMimeType,
  limits: ContentProcessingLimits,
): Promise<AssetMimeType> {
  if (isZip(body)) {
    const archive = await readSafeArchive(body, limits);
    if (isDocx(archive)) return AssetMimeType.DOCX;
    if (isEpub(archive)) return AssetMimeType.EPUB;
    throw new Error("ASSET_ARCHIVE_CONTAINER_UNSUPPORTED");
  }
  if (body.subarray(0, 5).toString("ascii") === "%PDF-") {
    return AssetMimeType.PDF;
  }
  if (body.length >= 8 && body.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return AssetMimeType.PNG;
  }
  if (
    body.length >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  ) {
    return AssetMimeType.JPEG;
  }
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString("ascii") === "RIFF" &&
    body.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return AssetMimeType.WEBP;
  }
  const text = decodeText(body);
  if (declared === AssetMimeType.APPLICATION_JSON) {
    assertJson(text);
    return AssetMimeType.APPLICATION_JSON;
  }
  return declared === AssetMimeType.TEXT_MARKDOWN
    ? AssetMimeType.TEXT_MARKDOWN
    : AssetMimeType.TEXT_PLAIN;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function isZip(body: Buffer): boolean {
  if (body.length < 4 || body[0] !== 0x50 || body[1] !== 0x4b) return false;
  return (
    (body[2] === 0x03 && body[3] === 0x04) ||
    (body[2] === 0x05 && body[3] === 0x06) ||
    (body[2] === 0x07 && body[3] === 0x08)
  );
}

function assertCompatibleMimeType(
  declared: AssetMimeType,
  detected: AssetMimeType,
): void {
  const textPair = [declared, detected].every((value) =>
    [AssetMimeType.TEXT_PLAIN, AssetMimeType.TEXT_MARKDOWN].includes(value),
  );
  if (!textPair && declared !== detected) {
    throw new Error("ASSET_DECLARED_TYPE_MISMATCH");
  }
}

function assertJson(value: string): void {
  try {
    JSON.parse(value);
  } catch {
    throw new Error("ASSET_JSON_INVALID");
  }
}

async function readSafeArchive(
  body: Buffer,
  limits: ContentProcessingLimits,
): Promise<SafeArchive> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      body,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true },
      (openError, zip) => {
        if (openError || !zip) {
          reject(new Error("ASSET_ARCHIVE_INVALID", { cause: openError }));
          return;
        }
        const entries = new Map<string, ArchiveEntry>();
        let entryCount = 0;
        let expandedBytes = 0;
        let firstEntry = "";
        const fail = (error: Error) => {
          zip.close();
          reject(error);
        };
        zip.once("error", (error) =>
          fail(new Error("ASSET_ARCHIVE_INVALID", { cause: error })),
        );
        zip.on("entry", (entry) => {
          try {
            const name = safeArchivePath(entry.fileName);
            if (!firstEntry) firstEntry = name;
            entryCount += 1;
            if (entryCount > limits.maxArchiveEntries) {
              throw new Error("ASSET_ARCHIVE_ENTRY_LIMIT");
            }
            if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
              throw new Error("ASSET_ARCHIVE_ENCRYPTED_ENTRY");
            }
            if (isSymlink(entry))
              throw new Error("ASSET_ARCHIVE_SYMLINK_REJECTED");
            if (entry.uncompressedSize > limits.maxArchiveEntryBytes) {
              throw new Error("ASSET_ARCHIVE_ENTRY_SIZE_LIMIT");
            }
            expandedBytes += entry.uncompressedSize;
            if (expandedBytes > limits.maxArchiveExpandedBytes) {
              throw new Error("ASSET_ARCHIVE_EXPANDED_SIZE_LIMIT");
            }
            const ratio =
              entry.uncompressedSize === 0
                ? 1
                : entry.compressedSize === 0
                  ? Number.POSITIVE_INFINITY
                  : entry.uncompressedSize / entry.compressedSize;
            if (ratio > limits.maxArchiveCompressionRatio) {
              throw new Error("ASSET_ARCHIVE_COMPRESSION_RATIO_LIMIT");
            }
            if (name.endsWith("/")) {
              zip.readEntry();
              return;
            }
            if (entries.has(name))
              throw new Error("ASSET_ARCHIVE_DUPLICATE_ENTRY");
            zip.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) {
                fail(
                  new Error("ASSET_ARCHIVE_ENTRY_READ_FAILED", {
                    cause: streamError,
                  }),
                );
                return;
              }
              const chunks: Buffer[] = [];
              let bytes = 0;
              stream.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes > limits.maxArchiveEntryBytes) {
                  stream.destroy(new Error("ASSET_ARCHIVE_ENTRY_SIZE_LIMIT"));
                  return;
                }
                chunks.push(chunk);
              });
              stream.once("error", (error) => fail(error));
              stream.once("end", () => {
                entries.set(name, {
                  body: Buffer.concat(chunks),
                  compressionMethod: entry.compressionMethod,
                });
                zip.readEntry();
              });
            });
          } catch (error) {
            fail(asError(error));
          }
        });
        zip.once("end", () => resolve({ entries, firstEntry }));
        zip.readEntry();
      },
    );
  });
}

function safeArchivePath(value: string): string {
  if (!value || value.includes("\0") || value.includes("\\")) {
    throw new Error("ASSET_ARCHIVE_PATH_INVALID");
  }
  const normalized = posix.normalize(value);
  if (
    posix.isAbsolute(value) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new Error("ASSET_ARCHIVE_PATH_TRAVERSAL");
  }
  return normalized;
}

function isSymlink(entry: yauzl.Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

function isDocx(archive: SafeArchive): boolean {
  return (
    archive.entries.has("[Content_Types].xml") &&
    archive.entries.has("word/document.xml")
  );
}

function assertDocx(archive: SafeArchive): void {
  if (!isDocx(archive)) throw new Error("ASSET_DOCX_STRUCTURE_INVALID");
  for (const name of archive.entries.keys()) {
    if (/vbaProject\.bin$|activeX|embeddings\//i.test(name)) {
      throw new Error("ASSET_DOCX_ACTIVE_CONTENT_REJECTED");
    }
    if (name.endsWith(".rels")) {
      const xml = xmlText(requiredEntry(archive, name));
      if (/TargetMode\s*=\s*["']External["']/i.test(xml)) {
        throw new Error("ASSET_DOCX_EXTERNAL_RELATIONSHIP_REJECTED");
      }
    }
  }
}

function extractDocx(archive: SafeArchive): string {
  assertDocx(archive);
  const names = [...archive.entries.keys()]
    .filter((name) =>
      /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(
        name,
      ),
    )
    .sort((left, right) =>
      left === "word/document.xml"
        ? -1
        : right === "word/document.xml"
          ? 1
          : left.localeCompare(right),
    );
  return names
    .map((name) =>
      xmlText(requiredEntry(archive, name))
        .replace(/<w:(?:tab|br)[^>]*\/?\s*>/gi, "\t")
        .replace(/<\/w:p\s*>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    )
    .join("\n");
}

function isEpub(archive: SafeArchive): boolean {
  const mimetype = archive.entries.get("mimetype");
  return (
    archive.firstEntry === "mimetype" &&
    mimetype?.compressionMethod === 0 &&
    mimetype.body.toString("ascii") === AssetMimeType.EPUB &&
    archive.entries.has("META-INF/container.xml")
  );
}

function assertEpub(archive: SafeArchive): void {
  if (!isEpub(archive)) throw new Error("ASSET_EPUB_STRUCTURE_INVALID");
  epubPackagePath(archive);
}

function extractEpub(archive: SafeArchive): string {
  assertEpub(archive);
  const packagePath = epubPackagePath(archive);
  const packageXml = xmlText(requiredEntry(archive, packagePath));
  const packageDirectory = posix.dirname(packagePath);
  const manifest = new Map<string, string>();
  for (const tag of packageXml.match(/<item\b[^>]*>/gi) ?? []) {
    const id = attribute(tag, "id");
    const href = attribute(tag, "href");
    const mediaType = attribute(tag, "media-type");
    if (
      id &&
      href &&
      /application\/xhtml\+xml|text\/html/.test(mediaType ?? "")
    ) {
      manifest.set(id, resolveArchivePath(packageDirectory, href));
    }
  }
  const spine = [
    ...packageXml.matchAll(
      /<itemref\b[^>]*\bidref\s*=\s*["']([^"']+)["'][^>]*>/gi,
    ),
  ]
    .map((match) => manifest.get(match[1]))
    .filter((value): value is string => Boolean(value));
  if (spine.length === 0) throw new Error("ASSET_EPUB_SPINE_REQUIRED");
  return spine
    .map((path) => htmlToText(xmlText(requiredEntry(archive, path))))
    .join("\n\n");
}

function epubPackagePath(archive: SafeArchive): string {
  const container = xmlText(requiredEntry(archive, "META-INF/container.xml"));
  const match = container.match(
    /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i,
  );
  if (!match) throw new Error("ASSET_EPUB_PACKAGE_REQUIRED");
  const path = safeArchivePath(match[1]);
  if (
    !archive.entries.has(path) ||
    extname(path).toLocaleLowerCase() !== ".opf"
  ) {
    throw new Error("ASSET_EPUB_PACKAGE_INVALID");
  }
  return path;
}

function resolveArchivePath(directory: string, href: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
    throw new Error("ASSET_EPUB_EXTERNAL_RESOURCE_REJECTED");
  }
  return safeArchivePath(posix.join(directory, href.split("#", 1)[0]));
}

function requiredEntry(archive: SafeArchive, name: string): Buffer {
  const entry = archive.entries.get(name);
  if (!entry) throw new Error(`ASSET_ARCHIVE_ENTRY_REQUIRED:${basename(name)}`);
  return entry.body;
}

function xmlText(body: Buffer): string {
  const text = decodeText(body);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new Error("ASSET_XML_ENTITY_DECLARATION_REJECTED");
  }
  return text;
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"),
  );
  return match?.[1];
}

function htmlToText(value: string): string {
  if (/<(?:script|iframe|object|embed)\b/i.test(value)) {
    throw new Error("ASSET_EPUB_ACTIVE_CONTENT_REJECTED");
  }
  return value
    .replace(/<(?:head|style)\b[^>]*>[\s\S]*?<\/(?:head|style)>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

async function pdfPageCount(
  body: Buffer,
  limits: ContentProcessingLimits,
): Promise<number> {
  const output = await runFileTool(body, ".pdf", "pdfinfo", (path) => [path], {
    ...limits,
    maxExtractedCharacters: 32_000,
  });
  const match = output.match(/^Pages:\s+(\d+)\s*$/m);
  const pages = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(pages) || pages < 1) {
    throw new Error("ASSET_PDF_PAGE_COUNT_INVALID");
  }
  if (pages > limits.maxDocumentPages) throw new Error("ASSET_PDF_PAGE_LIMIT");
  return pages;
}

async function runFileTool(
  body: Buffer,
  extension: string,
  command: string,
  args: (path: string) => readonly string[],
  limits: ContentProcessingLimits,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sylis-asset-"));
  const path = join(directory, `input${extension}`);
  try {
    await writeFile(path, body, { mode: 0o600 });
    return await runProcess(
      command,
      args(path),
      limits.parserTimeoutMs,
      limits.maxExtractedCharacters * 4,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runProcess(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        LANG: "C.UTF-8",
        HOME: "/nonexistent",
      },
    });
    const output: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? "");
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`ASSET_PARSER_TIMEOUT:${command}`));
    }, timeoutMs);
    child.once("error", () =>
      finish(new Error(`ASSET_PARSER_UNAVAILABLE:${command}`)),
    );
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error("ASSET_EXTRACTED_TEXT_LIMIT"));
        return;
      }
      output.push(chunk);
    });
    child.stderr.resume();
    child.once("close", (code) => {
      if (code !== 0) {
        finish(new Error(`ASSET_PARSER_FAILED:${command}:${code ?? "SIGNAL"}`));
        return;
      }
      finish(undefined, Buffer.concat(output).toString("utf8"));
    });
  });
}

function imageDimensions(
  body: Buffer,
  mimeType: AssetMimeType,
): { width: number; height: number } {
  switch (mimeType) {
    case AssetMimeType.PNG:
      if (body.length < 24) throw new Error("ASSET_PNG_INVALID");
      return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
    case AssetMimeType.JPEG:
      return jpegDimensions(body);
    case AssetMimeType.WEBP:
      return webpDimensions(body);
    default:
      throw new Error("ASSET_IMAGE_TYPE_UNSUPPORTED");
  }
}

function jpegDimensions(body: Buffer): { width: number; height: number } {
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) {
    throw new Error("ASSET_JPEG_INVALID");
  }
  let offset = 2;
  while (offset + 9 < body.length) {
    if (body[offset] !== 0xff) throw new Error("ASSET_JPEG_INVALID");
    const marker = body[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = body.readUInt16BE(offset);
    if (length < 2 || offset + length > body.length)
      throw new Error("ASSET_JPEG_INVALID");
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: body.readUInt16BE(offset + 3),
        width: body.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  throw new Error("ASSET_JPEG_DIMENSIONS_REQUIRED");
}

function webpDimensions(body: Buffer): { width: number; height: number } {
  if (
    body.length < 30 ||
    body.toString("ascii", 0, 4) !== "RIFF" ||
    body.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("ASSET_WEBP_INVALID");
  }
  const kind = body.toString("ascii", 12, 16);
  if (kind === "VP8X") {
    return {
      width: 1 + body.readUIntLE(24, 3),
      height: 1 + body.readUIntLE(27, 3),
    };
  }
  if (kind === "VP8L") {
    const bits = body.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8 " && body.length >= 30) {
    return {
      width: body.readUInt16LE(26) & 0x3fff,
      height: body.readUInt16LE(28) & 0x3fff,
    };
  }
  throw new Error("ASSET_WEBP_DIMENSIONS_REQUIRED");
}

function assertPixelLimit(
  dimensions: { width: number; height: number },
  maximum: number,
): void {
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    BigInt(dimensions.width) * BigInt(dimensions.height) > BigInt(maximum)
  ) {
    throw new Error("ASSET_IMAGE_PIXEL_LIMIT");
  }
}

function isImage(value: AssetMimeType): boolean {
  return [AssetMimeType.PNG, AssetMimeType.JPEG, AssetMimeType.WEBP].includes(
    value,
  );
}

function extensionFor(value: AssetMimeType): string {
  const extensions: Partial<Record<AssetMimeType, string>> = {
    [AssetMimeType.PNG]: ".png",
    [AssetMimeType.JPEG]: ".jpg",
    [AssetMimeType.WEBP]: ".webp",
  };
  const extension = extensions[value];
  if (!extension) throw new Error("ASSET_IMAGE_TYPE_UNSUPPORTED");
  return extension;
}

function decodeText(body: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new Error("ASSET_TEXT_ENCODING_INVALID");
  }
}

function normalizeExtractedText(value: string, maximum: number): string {
  const normalized = decodeEntities(value)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!normalized) throw new Error("ASSET_EXTRACTED_TEXT_EMPTY");
  if (normalized.length > maximum)
    throw new Error("ASSET_EXTRACTED_TEXT_LIMIT");
  return normalized;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, key: string) => {
      if (key.startsWith("#x"))
        return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
      if (key.startsWith("#"))
        return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
      return named[key.toLocaleLowerCase()] ?? entity;
    },
  );
}

function detectLanguage(value: string): AssetLanguageCode {
  const latin = value.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const han = value.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (latin === 0 && han === 0) return AssetLanguageCode.UNDETERMINED;
  if (
    latin > 0 &&
    han > 0 &&
    Math.min(latin, han) / Math.max(latin, han) >= 0.1
  ) {
    return AssetLanguageCode.MIXED;
  }
  return latin > han ? AssetLanguageCode.ENGLISH : AssetLanguageCode.CHINESE;
}

function assertSize(body: Buffer, maximum: number): void {
  if (body.length < 1 || body.length > maximum)
    throw new Error("ASSET_SIZE_INVALID");
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error("ASSET_PROCESSING_FAILED");
}
