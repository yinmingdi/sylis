import { ARTIFACT_TARGET_COLLECTIONS } from "@sylis/lexicon-contracts";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

interface IdRecord {
  kind: "ID";
  id: string;
  collectionPath: string;
  entityPath: string;
}

interface ReferenceRecord {
  kind: "REFERENCE";
  targetId: string;
  targetKind: string | null;
  path: string;
}

type IndexRecord = IdRecord | ReferenceRecord;

export interface ReferenceIndexReport {
  idCount: number;
  referenceCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class DiskBackedReferenceIndex {
  readonly #fileDescriptors = new Map<number, number>();
  readonly #shardCount: number;
  #closed = false;

  constructor(
    private readonly root: string,
    shardCount = 256,
  ) {
    if (shardCount < 1 || shardCount > 256) {
      throw new Error("Reference index shard count must be between 1 and 256.");
    }
    this.#shardCount = shardCount;
  }

  addEntity(value: unknown, entityPath: string, collectionPath: string): void {
    if (!isRecord(value)) return;
    if (typeof value.id === "string") {
      this.#append(value.id, {
        kind: "ID",
        id: value.id,
        collectionPath,
        entityPath: `${entityPath}/id`,
      });
    }
    this.#inspectReferences(value, entityPath);
  }

  closeWrites(): void {
    if (this.#closed) return;
    for (const descriptor of this.#fileDescriptors.values()) {
      closeSync(descriptor);
    }
    this.#fileDescriptors.clear();
    this.#closed = true;
  }

  validate(): ReferenceIndexReport {
    this.closeWrites();
    let idCount = 0;
    let referenceCount = 0;

    for (let shard = 0; shard < this.#shardCount; shard += 1) {
      const path = this.#shardPath(shard);
      if (!existsSync(path)) continue;
      const records = readFileSync(path, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as IndexRecord);
      const ids = new Map<string, IdRecord>();
      for (const record of records) {
        if (record.kind !== "ID") continue;
        idCount += 1;
        const previous = ids.get(record.id);
        if (previous) {
          throw new Error(
            `Artifact duplicate ID ${record.id} at ${record.entityPath}; first seen at ${previous.entityPath}.`,
          );
        }
        ids.set(record.id, record);
      }

      for (const record of records) {
        if (record.kind !== "REFERENCE") continue;
        referenceCount += 1;
        const target = ids.get(record.targetId);
        if (!target) {
          throw new Error(
            `Artifact missing reference ${record.targetId} at ${record.path}.`,
          );
        }
        if (record.targetKind !== null) {
          const expectedPath = ARTIFACT_TARGET_COLLECTIONS[record.targetKind];
          if (!expectedPath || target.collectionPath !== expectedPath) {
            throw new Error(
              `Artifact invalid ${record.targetKind} target ${record.targetId} at ${record.path}.`,
            );
          }
        }
      }
    }

    return { idCount, referenceCount };
  }

  #inspectReferences(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((child, index) =>
        this.#inspectReferences(child, `${path}/${index}`),
      );
      return;
    }
    if (!isRecord(value)) return;

    const typedTarget =
      typeof value.targetKind === "string" &&
      typeof value.targetId === "string";
    if (typedTarget) {
      this.#append(value.targetId as string, {
        kind: "REFERENCE",
        targetId: value.targetId as string,
        targetKind: value.targetKind as string,
        path: `${path}/targetId`,
      });
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "rawPayload") continue;
      if (
        key !== "id" &&
        key !== "externalId" &&
        !(typedTarget && key === "targetId") &&
        key.endsWith("Id") &&
        typeof child === "string"
      ) {
        this.#append(child, {
          kind: "REFERENCE",
          targetId: child,
          targetKind: null,
          path: `${path}/${key}`,
        });
      }
      this.#inspectReferences(child, `${path}/${key}`);
    }
  }

  #append(targetId: string, record: IndexRecord): void {
    if (this.#closed) throw new Error("Reference index is already closed.");
    const shard =
      createHash("sha256").update(targetId).digest()[0]! % this.#shardCount;
    let descriptor = this.#fileDescriptors.get(shard);
    if (descriptor === undefined) {
      descriptor = openSync(this.#shardPath(shard), "a");
      this.#fileDescriptors.set(shard, descriptor);
    }
    writeSync(descriptor, `${JSON.stringify(record)}\n`);
  }

  #shardPath(shard: number): string {
    return join(
      this.root,
      `references-${shard.toString(16).padStart(2, "0")}.jsonl`,
    );
  }
}
