import { parse } from "csv-parse";
import { createReadStream } from "node:fs";

import { sourceContext } from "./source-context";
import {
  CandidateFormType,
  SourceAdapterKind,
} from "../candidates/candidate-v1";
import type {
  CandidateSense,
  NormalizedSourceRecord,
} from "../candidates/candidate-v1";
import type { ResolvedSource } from "../manifest/source-manifest";
import {
  normalizePartOfSpeech,
  mapExchangeFeature,
} from "../normalize/vocabulary-map";

type EcdictRow = Record<string, string>;

function splitSourceLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/(?:\\n|\r?\n)/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parsePosLine(line: string): { pos: string; text: string } {
  const match = line.match(/^([a-z][a-z0-9-]*)\.\s*(.+)$/i);
  return match
    ? { pos: normalizePartOfSpeech(match[1]), text: match[2] }
    : { pos: "source:unknown", text: line };
}

function buildSenses(row: EcdictRow): CandidateSense[] {
  const byPos = new Map<string, CandidateSense>();
  const fallbackPos = normalizePartOfSpeech(row.pos);
  const getSense = (pos: string): CandidateSense => {
    const resolvedPos = pos === "source:unknown" ? fallbackPos : pos;
    const existing = byPos.get(resolvedPos);
    if (existing) return existing;
    const sense: CandidateSense = {
      sourceSenseKey: `${row.word}:${resolvedPos}`,
      partOfSpeech: resolvedPos,
      definitions: [],
      translations: [],
      examples: [],
      relations: [],
      tags: [],
    };
    byPos.set(resolvedPos, sense);
    return sense;
  };

  for (const line of splitSourceLines(row.definition)) {
    const parsed = parsePosLine(line);
    getSense(parsed.pos).definitions.push({
      languageTag: "en",
      text: parsed.text,
    });
  }
  for (const line of splitSourceLines(row.translation)) {
    const parsed = parsePosLine(line);
    getSense(parsed.pos).translations.push({
      languageTag: "zh-CN",
      text: parsed.text,
    });
  }
  if (byPos.size === 0) getSense(fallbackPos);
  return [...byPos.values()];
}

function parseExchange(row: EcdictRow) {
  return (row.exchange ?? "").split("/").flatMap((part) => {
    const separator = part.indexOf(":");
    if (separator < 1) return [];
    const key = part.slice(0, separator);
    const text = part.slice(separator + 1).trim();
    const feature = mapExchangeFeature(key);
    if (!text || !feature) return [];
    return [
      {
        text,
        formType: CandidateFormType.INFLECTED,
        features: [feature],
        formOf: row.word,
      },
    ];
  });
}

export async function* readEcdict(
  source: ResolvedSource,
): AsyncGenerator<NormalizedSourceRecord> {
  const parser = createReadStream(source.path).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_quotes: true,
    }),
  );
  for await (const value of parser) {
    const row = value as EcdictRow;
    const word = row.word?.trim();
    if (!word) continue;
    const senses = buildSenses(row);
    yield sourceContext(source, SourceAdapterKind.ECDICT, {
      sourceKey: word,
      rawPayload: row,
      languageTag: "en",
      headword: word,
      partOfSpeech: senses[0]?.partOfSpeech ?? normalizePartOfSpeech(row.pos),
      senses,
      forms: parseExchange(row),
      phonetics: row.phonetic ? [{ text: row.phonetic }] : [],
      books: splitSourceLines(row.tag?.replaceAll(" ", "\n")).map((tag) => ({
        bookKey: tag.toLowerCase(),
        title: tag.toUpperCase(),
      })),
      independentEntryEvidence: senses.some(
        (sense) =>
          sense.definitions.length > 0 || sense.translations.length > 0,
      ),
      formOfEvidence: [],
    });
  }
}
