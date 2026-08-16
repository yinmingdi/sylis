import {
  assertValidArtifact,
  canonicalContentHash,
  canonicalJsonChunks,
  sortArtifactArrays,
  type SylisLexiconArtifactV1,
  validateArtifactStream,
  validateLinguistics,
} from "@sylis/lexicon-artifact";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createZstdDecompress } from "node:zlib";

import {
  createSingleFrameZstdCompress,
  inspectSingleZstdFrame,
} from "./zstd-envelope";

export interface ArtifactWriteResult {
  path: string;
  contentHash: string;
  artifactSha256: string;
  compressedBytes: number;
  decompressedBytes: number;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

export async function writeArtifact(
  artifact: SylisLexiconArtifactV1,
  outputPath: string,
): Promise<ArtifactWriteResult> {
  sortArtifactArrays(artifact);
  const linguisticIssues = validateLinguistics(artifact);
  if (linguisticIssues.length > 0) {
    throw new Error(
      `Linguistic validation failed: ${linguisticIssues.map((issue) => issue.code).join(", ")}`,
    );
  }
  const contentHash = canonicalContentHash(artifact);
  artifact.manifest.contentHash = contentHash;
  assertValidArtifact(artifact);

  await mkdir(dirname(outputPath), { recursive: true });
  const chunks = Readable.from(canonicalJsonChunks(artifact));
  await pipeline(
    chunks,
    createSingleFrameZstdCompress(),
    createWriteStream(outputPath),
  );
  const readback = await validateArtifactStream(outputPath, {
    expectedContentHash: contentHash,
  });
  const artifactSha256 = await sha256File(outputPath);
  return {
    path: outputPath,
    contentHash,
    artifactSha256,
    compressedBytes: readback.compressedBytes,
    decompressedBytes: readback.decompressedBytes,
  };
}

export async function readArtifact(
  inputPath: string,
  maxDecompressedBytes = 512 * 1024 * 1024,
): Promise<SylisLexiconArtifactV1> {
  const { compressedBytes } = await inspectSingleZstdFrame(
    inputPath,
    maxDecompressedBytes,
  );
  const chunks: Buffer[] = [];
  let bytes = 0;
  const decompressed = createReadStream(inputPath).pipe(createZstdDecompress());
  for await (const chunk of decompressed) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxDecompressedBytes) {
      throw new Error("Artifact exceeds decompressed byte limit.");
    }
    if (bytes / compressedBytes > 200) {
      throw new Error("Artifact exceeds compression ratio limit.");
    }
    chunks.push(buffer);
  }
  const artifact = JSON.parse(
    Buffer.concat(chunks).toString("utf8"),
  ) as unknown;
  assertValidArtifact(artifact);
  return artifact;
}
