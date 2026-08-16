import type { NormalizedSourceRecord } from "../candidates/candidate-v1";
import type { ResolvedSource } from "../manifest/source-manifest";

export interface SourceRecordRegistryPort {
  register(
    sources: readonly ResolvedSource[],
    records: readonly NormalizedSourceRecord[],
  ): Promise<void>;
}
