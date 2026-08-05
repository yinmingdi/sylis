import { readEcdict } from "./ecdict";
import { readOewn } from "./oewn";
import { readWiktextract } from "./wiktextract";
import { readYoudao } from "./youdao";
import type { NormalizedSourceRecord } from "../candidates/candidate-v1";
import type { ResolvedSource } from "../manifest/source-manifest";

export function readSource(
  source: ResolvedSource,
): AsyncGenerator<NormalizedSourceRecord> {
  switch (source.adapter) {
    case "ECDICT":
      return readEcdict(source);
    case "WIKTEXTRACT_EN":
      return readWiktextract(source);
    case "WN_LMF":
      return readOewn(source);
    case "YOUDAO_NDJSON":
      return readYoudao(source);
  }
}
