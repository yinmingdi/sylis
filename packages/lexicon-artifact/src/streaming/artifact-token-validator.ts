import { TokenType } from "@streamparser/json";
import { createHash, type Hash } from "node:crypto";

import { sylisLexiconArtifactV1Schema } from "../schema";

type SchemaNode = Record<string, unknown>;

interface ObjectShape {
  allowed: ReadonlySet<string>;
  required: ReadonlySet<string>;
}

interface ObjectFrame {
  kind: "OBJECT";
  path: string[];
  emit: boolean;
  emittedValues: number;
  state: "KEY_OR_END" | "COLON" | "VALUE" | "COMMA_OR_END";
  currentKey: string | null;
  lastKey: string | null;
  seenKeys: Set<string>;
  shape?: ObjectShape;
}

interface ArrayFrame {
  kind: "ARRAY";
  path: string[];
  emit: boolean;
  emittedValues: number;
  state: "VALUE_OR_END" | "COMMA_OR_END";
  nextIndex: number;
}

type Frame = ObjectFrame | ArrayFrame;

export interface ArtifactTokenLimits {
  maxDepth: number;
  maxStringBytes: number;
}

const rootSchema = sylisLexiconArtifactV1Schema as unknown as SchemaNode;
const definitions = rootSchema.$defs as Record<string, SchemaNode>;

function dereference(node: SchemaNode): SchemaNode {
  let current = node;
  const visited = new Set<string>();
  while (typeof current.$ref === "string") {
    const reference = current.$ref;
    if (!reference.startsWith("#/$defs/")) return current;
    if (visited.has(reference)) return current;
    visited.add(reference);
    const resolved = definitions[reference.slice("#/$defs/".length)];
    if (!resolved) throw new Error(`Unknown schema reference ${reference}.`);
    current = resolved;
  }
  return current;
}

function pathKey(segments: string[]): string {
  return `/${segments.join("/")}`;
}

function collectObjectShapes(
  node: SchemaNode,
  segments: string[],
  result: Map<string, ObjectShape>,
): void {
  const resolved = dereference(node);
  if (resolved.type !== "object") return;
  const properties = (resolved.properties ?? {}) as Record<string, SchemaNode>;
  if (resolved.additionalProperties === false) {
    result.set(pathKey(segments), {
      allowed: new Set(Object.keys(properties)),
      required: new Set((resolved.required ?? []) as string[]),
    });
  }
  for (const [key, child] of Object.entries(properties)) {
    const childSchema = dereference(child);
    if (childSchema.type === "object") {
      collectObjectShapes(childSchema, [...segments, key], result);
    }
  }
}

const objectShapes = new Map<string, ObjectShape>();
collectObjectShapes(rootSchema, [], objectShapes);

function compareUnicode(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalPrimitive(value: unknown): string {
  const normalized =
    typeof value === "number" && Object.is(value, -0) ? 0 : value;
  const serialized = JSON.stringify(normalized);
  if (serialized === undefined) {
    throw new Error("Artifact contains a non-JSON primitive.");
  }
  return serialized;
}

export class ArtifactTokenValidator {
  readonly #hash: Hash = createHash("sha256");
  readonly #frames: Frame[] = [];
  readonly #seenCollections = new Set<string>();
  #rootSeen = false;
  #finished = false;

  constructor(
    private readonly collectionPaths: ReadonlySet<string>,
    private readonly limits: ArtifactTokenLimits,
  ) {}

  accept(token: TokenType, value: unknown, partial = false): void {
    if (this.#finished)
      throw new Error("Artifact token validator is finished.");
    if (
      token === TokenType.STRING &&
      Buffer.byteLength(String(value), "utf8") > this.limits.maxStringBytes
    ) {
      throw new Error("Artifact string exceeds the byte limit.");
    }
    if (partial) return;
    switch (token) {
      case TokenType.LEFT_BRACE:
        this.#openContainer("OBJECT");
        return;
      case TokenType.LEFT_BRACKET:
        this.#openContainer("ARRAY");
        return;
      case TokenType.RIGHT_BRACE:
        this.#closeObject();
        return;
      case TokenType.RIGHT_BRACKET:
        this.#closeArray();
        return;
      case TokenType.COLON:
        this.#colon();
        return;
      case TokenType.COMMA:
        this.#comma();
        return;
      case TokenType.STRING:
        if (this.#isObjectKey()) this.#key(String(value));
        else this.#primitive(value);
        return;
      case TokenType.NUMBER:
      case TokenType.TRUE:
      case TokenType.FALSE:
      case TokenType.NULL:
        this.#primitive(value);
        return;
      case TokenType.SEPARATOR:
        throw new Error("Artifact stream must contain exactly one JSON value.");
    }
  }

  finish(): string {
    if (this.#finished)
      throw new Error("Artifact token validator is finished.");
    if (!this.#rootSeen || this.#frames.length !== 0) {
      throw new Error("Artifact JSON structure did not terminate cleanly.");
    }
    const missingCollections = [...this.collectionPaths]
      .filter((path) => !this.#seenCollections.has(path))
      .sort(compareUnicode);
    if (missingCollections.length > 0) {
      throw new Error(
        `Artifact is missing required collections: ${missingCollections.slice(0, 10).join(", ")}.`,
      );
    }
    this.#finished = true;
    return `sha256:${this.#hash.digest("hex")}`;
  }

  #isObjectKey(): boolean {
    const frame = this.#frames.at(-1);
    return frame?.kind === "OBJECT" && frame.state === "KEY_OR_END";
  }

  #key(key: string): void {
    const frame = this.#frames.at(-1);
    if (!frame || frame.kind !== "OBJECT" || frame.state !== "KEY_OR_END") {
      throw new Error("Artifact object key appeared in an invalid position.");
    }
    if (frame.lastKey !== null && compareUnicode(frame.lastKey, key) >= 0) {
      throw new Error(
        `Artifact object keys at ${pathKey(frame.path)} are not in canonical order.`,
      );
    }
    if (frame.shape && !frame.shape.allowed.has(key)) {
      throw new Error(
        `Artifact has unknown property ${pathKey([...frame.path, key])}.`,
      );
    }
    frame.lastKey = key;
    frame.currentKey = key;
    frame.seenKeys.add(key);
    frame.state = "COLON";
  }

  #colon(): void {
    const frame = this.#frames.at(-1);
    if (!frame || frame.kind !== "OBJECT" || frame.state !== "COLON") {
      throw new Error("Artifact colon appeared in an invalid position.");
    }
    frame.state = "VALUE";
  }

  #comma(): void {
    const frame = this.#frames.at(-1);
    if (!frame || frame.state !== "COMMA_OR_END") {
      throw new Error("Artifact comma appeared in an invalid position.");
    }
    frame.state = frame.kind === "OBJECT" ? "KEY_OR_END" : "VALUE_OR_END";
  }

  #primitive(value: unknown): void {
    const { emit } = this.#beginValue();
    if (emit) this.#hash.update(canonicalPrimitive(value));
  }

  #openContainer(kind: Frame["kind"]): void {
    if (this.#frames.length >= this.limits.maxDepth) {
      throw new Error("Artifact JSON exceeds the depth limit.");
    }
    const { path, emit } = this.#beginValue();
    if (kind === "ARRAY" && this.collectionPaths.has(pathKey(path))) {
      this.#seenCollections.add(pathKey(path));
    }
    if (emit) this.#hash.update(kind === "OBJECT" ? "{" : "[");
    this.#frames.push(
      kind === "OBJECT"
        ? {
            kind,
            path,
            emit,
            emittedValues: 0,
            state: "KEY_OR_END",
            currentKey: null,
            lastKey: null,
            seenKeys: new Set(),
            shape: objectShapes.get(pathKey(path)),
          }
        : {
            kind,
            path,
            emit,
            emittedValues: 0,
            state: "VALUE_OR_END",
            nextIndex: 0,
          },
    );
  }

  #closeObject(): void {
    const frame = this.#frames.at(-1);
    if (
      !frame ||
      frame.kind !== "OBJECT" ||
      (frame.state !== "KEY_OR_END" && frame.state !== "COMMA_OR_END")
    ) {
      throw new Error("Artifact object ended in an invalid position.");
    }
    const missing = [...(frame.shape?.required ?? [])].filter(
      (key) => !frame.seenKeys.has(key),
    );
    if (missing.length > 0) {
      throw new Error(
        `Artifact object ${pathKey(frame.path)} is missing required properties: ${missing.join(", ")}.`,
      );
    }
    if (frame.emit) this.#hash.update("}");
    this.#frames.pop();
  }

  #closeArray(): void {
    const frame = this.#frames.at(-1);
    if (
      !frame ||
      frame.kind !== "ARRAY" ||
      (frame.state !== "VALUE_OR_END" && frame.state !== "COMMA_OR_END")
    ) {
      throw new Error("Artifact array ended in an invalid position.");
    }
    if (frame.emit) this.#hash.update("]");
    this.#frames.pop();
  }

  #beginValue(): { path: string[]; emit: boolean } {
    const parent = this.#frames.at(-1);
    if (!parent) {
      if (this.#rootSeen) {
        throw new Error("Artifact stream contains multiple root values.");
      }
      this.#rootSeen = true;
      return { path: [], emit: true };
    }

    if (parent.kind === "OBJECT") {
      if (parent.state !== "VALUE" || parent.currentKey === null) {
        throw new Error(
          "Artifact object value appeared in an invalid position.",
        );
      }
      const path = [...parent.path, parent.currentKey];
      const emit = parent.emit && pathKey(path) !== "/manifest/contentHash";
      if (emit) {
        if (parent.emittedValues > 0) this.#hash.update(",");
        this.#hash.update(JSON.stringify(parent.currentKey));
        this.#hash.update(":");
        parent.emittedValues += 1;
      }
      parent.currentKey = null;
      parent.state = "COMMA_OR_END";
      return { path, emit };
    }

    if (parent.state !== "VALUE_OR_END") {
      throw new Error("Artifact array value appeared in an invalid position.");
    }
    const path = [...parent.path, String(parent.nextIndex)];
    if (parent.emit) {
      if (parent.emittedValues > 0) this.#hash.update(",");
      parent.emittedValues += 1;
    }
    parent.nextIndex += 1;
    parent.state = "COMMA_OR_END";
    return { path, emit: parent.emit };
  }
}
