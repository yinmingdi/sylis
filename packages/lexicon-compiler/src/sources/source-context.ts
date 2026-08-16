import type { JsonValue } from "@sylis/lexicon-artifact";
import { stableArtifactId } from "@sylis/utils/stable-uuid";
import { createHash } from "node:crypto";

import type {
  NormalizedSourceRecord,
  SourceAdapterKind,
} from "../candidates/candidate-v1";
import type { ResolvedSource } from "../manifest/source-manifest";
import { normalizeIdentityText } from "../normalize/text-profile";

export interface SourceCandidateInput
  extends Omit<
    NormalizedSourceRecord,
    | "schemaVersion"
    | "adapter"
    | "datasetKey"
    | "datasetVersion"
    | "datasetVersionId"
    | "sourceRecordId"
    | "sourceUri"
    | "rightsPolicyId"
    | "rawPayloadHash"
    | "normalizedHeadword"
  > {
  rawPayload: JsonValue;
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableId(prefix: string, ...parts: string[]): string {
  return stableArtifactId(prefix, ...parts);
}

export function sourceContext(
  source: ResolvedSource,
  adapter: SourceAdapterKind,
  input: SourceCandidateInput,
): NormalizedSourceRecord {
  const raw = JSON.stringify(input.rawPayload);
  const normalizedHeadword = normalizeIdentityText(input.headword);
  const datasetVersionId = stableId(
    "datasetVersion",
    source.key,
    source.version,
  );
  return {
    ...input,
    schemaVersion: "sylis.lexicon-candidate/1",
    adapter,
    datasetKey: source.key,
    datasetVersion: source.version,
    datasetVersionId,
    sourceRecordId: stableId("sourceRecord", datasetVersionId, input.sourceKey),
    sourceUri: source.sourceUri,
    rightsPolicyId: stableId("rightsPolicy", source.key, source.version),
    rawPayloadHash: `sha256:${hashText(raw)}`,
    headword: normalizedHeadword,
    normalizedHeadword,
  };
}
