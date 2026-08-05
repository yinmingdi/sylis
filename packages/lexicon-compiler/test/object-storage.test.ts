import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createPinnedEndpointLookup,
  publishContentAddressedObject,
  s3ObjectStorageConfigFromEnv,
  type ContentAddressedObjectStoragePort,
  type RemoteObjectMetadata,
} from "../src/materialize/object-storage";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

class FakeStorage implements ContentAddressedObjectStoragePort {
  readonly bucket = "lexicon-artifacts-test";
  readonly objects = new Map<string, RemoteObjectMetadata>();
  uploads = 0;

  async head(key: string): Promise<RemoteObjectMetadata | null> {
    return this.objects.get(key) ?? null;
  }

  async upload(options: {
    key: string;
    byteSize: number;
    sha256: string;
    onProgress(processedBytes: number): void;
  }): Promise<void> {
    this.uploads += 1;
    options.onProgress(options.byteSize);
    this.objects.set(options.key, {
      byteSize: options.byteSize,
      sha256: options.sha256,
    });
  }
}

describe("content-addressed object publisher", () => {
  it("returns the pinned address in Node's single and all-address forms", async () => {
    const lookup = createPinnedEndpointLookup("138.2.31.252");
    const runLookup = (all: boolean) =>
      new Promise<{
        address: string | { address: string; family: number }[];
        family?: number;
      }>((resolve, reject) => {
        lookup("storage.example", { all }, (error, address, family) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ address, family });
        });
      });

    await expect(runLookup(false)).resolves.toEqual({
      address: "138.2.31.252",
      family: 4,
    });
    await expect(runLookup(true)).resolves.toEqual({
      address: [{ address: "138.2.31.252", family: 4 }],
      family: undefined,
    });
  });

  it("accepts Railway's virtual-host URL style", () => {
    expect(
      s3ObjectStorageConfigFromEnv({
        AWS_ENDPOINT_URL: "https://storage.example",
        AWS_DEFAULT_REGION: "auto",
        AWS_S3_BUCKET_NAME: "bucket",
        AWS_ACCESS_KEY_ID: "access",
        AWS_SECRET_ACCESS_KEY: "secret",
        AWS_S3_URL_STYLE: "virtual-host",
        AWS_ENDPOINT_IP: "138.2.31.252",
      }),
    ).toMatchObject({
      forcePathStyle: false,
      endpointIp: "138.2.31.252",
    });
  });

  it("uploads by digest and reuses only matching remote bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-object-publish-"));
    const inputPath = join(root, "source.jsonl.gz");
    const bytes = "immutable-source";
    await writeFile(inputPath, bytes);
    const digest = sha256(bytes);
    const storage = new FakeStorage();
    const stages: string[] = [];

    const first = await publishContentAddressedObject(
      {
        inputPath,
        sha256: digest,
        objectName: "raw-source.jsonl.gz",
        contentType: "application/gzip",
        progress: { report: (event) => stages.push(event.stage) },
      },
      storage,
    );
    const second = await publishContentAddressedObject(
      {
        inputPath,
        sha256: `sha256:${digest}`,
        objectName: "raw-source.jsonl.gz",
        contentType: "application/gzip",
      },
      storage,
    );

    expect(first).toMatchObject({
      uri: `s3://lexicon-artifacts-test/sha256/${digest}/raw-source.jsonl.gz`,
      sha256: `sha256:${digest}`,
      byteSize: Buffer.byteLength(bytes),
      reused: false,
    });
    expect(second).toEqual({ ...first, reused: true });
    expect(storage.uploads).toBe(1);
    expect(stages).toEqual([
      "VERIFY_LOCAL",
      "VERIFY_LOCAL",
      "CHECK_REMOTE",
      "UPLOAD",
      "UPLOAD",
      "VERIFY_REMOTE",
    ]);
  });

  it("rejects an existing object whose metadata contradicts its digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-object-conflict-"));
    const inputPath = join(root, "source.bin");
    const bytes = "source";
    await writeFile(inputPath, bytes);
    const digest = sha256(bytes);
    const storage = new FakeStorage();
    storage.objects.set(`sha256/${digest}/source.bin`, {
      byteSize: Buffer.byteLength(bytes),
      sha256: "0".repeat(64),
    });

    await expect(
      publishContentAddressedObject({ inputPath, sha256: digest }, storage),
    ).rejects.toThrow("remote object metadata mismatch");
    expect(storage.uploads).toBe(0);
  });

  it("rejects local checksum mismatches before contacting storage", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-object-checksum-"));
    const inputPath = join(root, "source.bin");
    await writeFile(inputPath, "source");
    const storage = new FakeStorage();

    await expect(
      publishContentAddressedObject(
        { inputPath, sha256: "0".repeat(64) },
        storage,
      ),
    ).rejects.toThrow("source checksum mismatch");
    expect(storage.uploads).toBe(0);
  });
});
