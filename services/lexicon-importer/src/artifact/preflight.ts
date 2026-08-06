import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import { assertMappingRegistryComplete } from "./mapping-registry";
import { streamArtifact, type ArtifactReadResult } from "./reader";

async function sha256File(path: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path))
    digest.update(chunk as Buffer);
  return `sha256:${digest.digest("hex")}`;
}

export interface ArtifactPreflightResult extends ArtifactReadResult {
  artifactHash: string;
}

export async function preflightArtifact(
  path: string,
  expectedArtifactHash?: string,
): Promise<ArtifactPreflightResult> {
  assertMappingRegistryComplete();
  const artifactHash = await sha256File(path);
  if (expectedArtifactHash && expectedArtifactHash !== artifactHash) {
    throw new Error("ARTIFACT_HASH_MISMATCH");
  }
  const result = await streamArtifact(path);
  return { ...result, artifactHash };
}
