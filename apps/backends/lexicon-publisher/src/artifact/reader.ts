import { JSONParser } from "@streamparser/json";
import {
  ARTIFACT_SCHEMA_VERSION,
  ArtifactCollectionPath,
  inspectSingleZstdFrame,
  sylisLexiconArtifactV1Schema,
  type ArtifactManifest,
  type ValidationSummary,
} from "@sylis/lexicon-artifact";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { createHash, type Hash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createZstdDecompress } from "node:zlib";

import { ARTIFACT_COLLECTION_PATHS } from "./mapping-registry";

const MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

interface SchemaNode {
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  $ref?: string;
  $id?: string;
  $defs?: Record<string, SchemaNode>;
}

export interface ArtifactEntity {
  path: ArtifactCollectionPath;
  position: number;
  value: Record<string, unknown>;
}

export interface ArtifactReadHandlers {
  onManifest?(manifest: ArtifactManifest): void | Promise<void>;
  onEntity?(entity: ArtifactEntity): void | Promise<void>;
}

export interface ArtifactReadResult {
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  manifest: ArtifactManifest;
  counts: Record<string, number>;
  compressedBytes: number;
  decompressedBytes: number;
  contentHash: string;
  validationSummary: ValidationSummary;
}

class CanonicalContentHashScanner {
  private readonly hash: Hash = createHash("sha256");
  private buffer = Buffer.alloc(0);
  private removed = false;

  accept(chunk: Uint8Array): void {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    this.removeContentHash();
    if (this.buffer.length > 256) {
      this.hash.update(this.buffer.subarray(0, this.buffer.length - 256));
      this.buffer = this.buffer.subarray(this.buffer.length - 256);
    }
  }

  finish(): string {
    this.removeContentHash();
    if (!this.removed) throw new Error("ARTIFACT_CONTENT_HASH_FIELD_MISSING");
    this.hash.update(this.buffer);
    return `sha256:${this.hash.digest("hex")}`;
  }

  private removeContentHash(): void {
    if (this.removed) return;
    const match = this.buffer
      .toString("utf8")
      .match(/,"contentHash":"sha256:[a-f0-9]{64}","counts":/);
    if (!match || match.index === undefined) return;
    this.buffer = Buffer.concat([
      this.buffer.subarray(0, match.index),
      Buffer.from(',"counts":'),
      this.buffer.subarray(match.index + Buffer.byteLength(match[0])),
    ]);
    this.removed = true;
  }
}

const root = sylisLexiconArtifactV1Schema as unknown as SchemaNode;
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
addFormats(ajv);
ajv.addSchema(sylisLexiconArtifactV1Schema);

function schemaValidator<T>(reference: string): ValidateFunction<T> {
  if (!root.$id) throw new Error("ARTIFACT_ROOT_SCHEMA_ID_MISSING");
  const validator = ajv.getSchema<T>(`${root.$id}${reference}`);
  if (!validator) {
    throw new Error(`ARTIFACT_SCHEMA_REFERENCE_UNKNOWN:${reference}`);
  }
  return validator;
}

function dereference(node: SchemaNode): SchemaNode {
  let current = node;
  while (current.$ref?.startsWith("#/$defs/")) {
    current = root.$defs?.[current.$ref.slice("#/$defs/".length)] ?? current;
    if (current.$ref === node.$ref) break;
  }
  return current;
}

function schemaAt(path: string): SchemaNode {
  let current = root;
  for (const segment of path.split("/").filter(Boolean)) {
    current = dereference(current);
    current = current.properties?.[segment] ?? {};
  }
  return dereference(current);
}

function validatorFor(node: SchemaNode): ValidateFunction {
  const reference = node.items?.$ref;
  if (!root.$id || !reference) {
    throw new Error("ARTIFACT_COLLECTION_ITEM_SCHEMA_MISSING");
  }
  return schemaValidator(reference);
}

const validators = new Map(
  [...ARTIFACT_COLLECTION_PATHS].map((path) => [
    path,
    validatorFor(schemaAt(path)),
  ]),
);
const manifestValidator = schemaValidator<ArtifactManifest>(
  "#/$defs/ArtifactManifest",
);
const validationSummaryValidator = schemaValidator<ValidationSummary>(
  "#/$defs/ValidationSummary",
);

function callbackPath(
  stack: Array<{ key?: string | number }>,
  key: unknown,
): string {
  return `$.${[
    ...stack.map((entry) => entry.key).filter((value) => value !== undefined),
    key,
  ]
    .filter((value) => value !== undefined)
    .join(".")}`;
}

export async function streamArtifact(
  inputPath: string,
  handlers: ArtifactReadHandlers = {},
): Promise<ArtifactReadResult> {
  const inspectedCompressedBytes = await inspectSingleZstdFrame(inputPath);
  const counts = Object.fromEntries(
    [...ARTIFACT_COLLECTION_PATHS].map((path) => [path, 0]),
  );
  let manifest: ArtifactManifest | undefined;
  let schemaVersion: unknown;
  let validationSummary: ValidationSummary | undefined;
  let applicationError: Error | undefined;
  let parserError: Error | undefined;
  let pending = Promise.resolve();
  let decompressedBytes = 0;
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  const contentHashScanner = new CanonicalContentHashScanner();
  const parser = new JSONParser({
    keepStack: false,
    stringBufferSize: 64 * 1024,
    numberBufferSize: 64,
    paths: [
      "$.schemaVersion",
      "$.manifest",
      "$.quality.validationSummary",
      ...[...ARTIFACT_COLLECTION_PATHS].map(
        (path) => `$.${path.slice(1).replaceAll("/", ".")}.*`,
      ),
    ],
  });
  parser.onError = (error) => {
    parserError = error;
  };
  parser.onValue = ({ value, key, stack }) => {
    if (applicationError) return;
    const path = callbackPath(stack, key);
    if (path === "$.schemaVersion") {
      schemaVersion = value;
      return;
    }
    if (path === "$.manifest") {
      if (!manifestValidator(value)) {
        applicationError = new Error("ARTIFACT_MANIFEST_SCHEMA_INVALID");
        return;
      }
      manifest = value;
      if (handlers.onManifest) {
        pending = pending.then(() => handlers.onManifest!(manifest!));
      }
      return;
    }
    if (path === "$.quality.validationSummary") {
      if (!validationSummaryValidator(value)) {
        applicationError = new Error("ARTIFACT_VALIDATION_SUMMARY_INVALID");
        return;
      }
      validationSummary = value;
      return;
    }
    const collectionPath = `/${path
      .replace(/^\$\./, "")
      .replace(/\.\d+$/, "")
      .replaceAll(".", "/")}` as ArtifactCollectionPath;
    const validator = validators.get(collectionPath);
    if (!validator || typeof value !== "object" || value === null) {
      applicationError = new Error(`ARTIFACT_PATH_INVALID:${path}`);
      return;
    }
    if (!validator(value)) {
      applicationError = new Error(`ARTIFACT_ENTITY_SCHEMA_INVALID:${path}`);
      return;
    }
    const position = counts[collectionPath] ?? 0;
    counts[collectionPath] = position + 1;
    if (handlers.onEntity) {
      pending = pending.then(() =>
        handlers.onEntity!({
          path: collectionPath,
          position,
          value: value as Record<string, unknown>,
        }),
      );
    }
  };

  const source = createReadStream(inputPath).pipe(createZstdDecompress());
  for await (const chunk of source) {
    const bytes = chunk as Uint8Array;
    utf8.decode(bytes, { stream: true });
    decompressedBytes += Buffer.byteLength(bytes);
    contentHashScanner.accept(bytes);
    if (decompressedBytes > MAX_DECOMPRESSED_BYTES) {
      source.destroy();
      throw new Error("ARTIFACT_DECOMPRESSED_LIMIT_EXCEEDED");
    }
    if (decompressedBytes / inspectedCompressedBytes > MAX_COMPRESSION_RATIO) {
      source.destroy();
      throw new Error("ARTIFACT_COMPRESSION_RATIO_EXCEEDED");
    }
    parser.write(bytes);
    await pending;
    if (applicationError) throw applicationError;
    if (parserError) throw parserError;
  }
  utf8.decode();
  if (!parser.isEnded) parser.end();
  await pending;
  if (applicationError) throw applicationError;
  if (parserError) throw parserError;
  if (
    schemaVersion !== ARTIFACT_SCHEMA_VERSION ||
    !manifest ||
    !validationSummary
  ) {
    throw new Error("ARTIFACT_ROOT_INVALID");
  }
  for (const [path, count] of Object.entries(counts)) {
    if (manifest.counts[path] !== count) {
      throw new Error(`ARTIFACT_COUNT_MISMATCH:${path}`);
    }
  }
  const contentHash = contentHashScanner.finish();
  if (contentHash !== manifest.contentHash)
    throw new Error("ARTIFACT_CONTENT_HASH_MISMATCH");
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    manifest,
    counts,
    compressedBytes: inspectedCompressedBytes,
    decompressedBytes,
    contentHash,
    validationSummary,
  };
}
