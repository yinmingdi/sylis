import { XMLParser } from "fast-xml-parser";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createGunzip } from "node:zlib";

import { sourceContext } from "./source-context";
import type {
  CandidateFrame,
  CandidateRelation,
  NormalizedSourceRecord,
} from "../candidates/candidate-v1";
import type { ResolvedSource } from "../manifest/source-manifest";
import { normalizePartOfSpeech } from "../normalize/vocabulary-map";

type XmlRecord = Record<string, unknown>;

function array<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function textValues(value: unknown): string[] {
  return array(
    value as string | XmlRecord | Array<string | XmlRecord> | undefined,
  ).flatMap((item) => {
    if (typeof item === "string") return [item];
    const text = item?.["#text"];
    return typeof text === "string" ? [text] : [];
  });
}

async function isGzip(path: string): Promise<boolean> {
  const handle = await open(path, "r");
  try {
    const signature = Buffer.alloc(2);
    const { bytesRead } = await handle.read(signature, 0, 2, 0);
    return bytesRead === 2 && signature[0] === 0x1f && signature[1] === 0x8b;
  } finally {
    await handle.close();
  }
}

async function readXml(path: string): Promise<string> {
  const file = createReadStream(path);
  const input = (await isGzip(path)) ? file.pipe(createGunzip()) : file;
  input.setEncoding("utf8");
  let xml = "";
  for await (const chunk of input) xml += String(chunk);
  return xml;
}

function relationType(
  value: unknown,
): CandidateRelation["relationType"] | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLocaleLowerCase().replaceAll("_", "-");
  if (normalized.includes("hypernym")) return "HYPERNYM";
  if (normalized.includes("hyponym")) return "HYPONYM";
  if (normalized.includes("antonym")) return "ANTONYM";
  if (normalized.includes("synonym") || normalized === "similar")
    return "SYNONYM";
  return normalized.includes("also") || normalized.includes("related")
    ? "RELATED"
    : null;
}

function syntacticFrames(
  rawEntry: XmlRecord,
  senseIds: Set<string>,
): CandidateFrame[] {
  return array(
    rawEntry.SyntacticBehaviour as XmlRecord | XmlRecord[] | undefined,
  ).flatMap((behaviour, index) => {
    const restrictedSenses =
      typeof behaviour.senses === "string"
        ? new Set(behaviour.senses.split(/\s+/))
        : null;
    if (
      restrictedSenses &&
      ![...restrictedSenses].some((senseId) => senseIds.has(senseId))
    ) {
      return [];
    }
    const displayTemplate =
      typeof behaviour.subcategorizationFrame === "string"
        ? behaviour.subcategorizationFrame
        : typeof behaviour.frame === "string"
          ? behaviour.frame
          : undefined;
    if (!displayTemplate) return [];
    const argumentsValue = array(
      behaviour.SyntacticArgument as XmlRecord | XmlRecord[] | undefined,
    );
    return [
      {
        frameKey:
          typeof behaviour.id === "string"
            ? behaviour.id
            : `syntactic-behaviour-${index + 1}`,
        frameType: "WN_LMF_SYNTACTIC_BEHAVIOUR",
        displayTemplate,
        arguments: argumentsValue.map((argument) => ({
          syntacticFunction:
            typeof argument.syntacticFunction === "string"
              ? argument.syntacticFunction
              : typeof argument.function === "string"
                ? argument.function
                : "COMPLEMENT",
          phraseType:
            typeof argument.phraseType === "string"
              ? argument.phraseType
              : "PHRASE",
          marker:
            typeof argument.marker === "string" ? argument.marker : undefined,
          optional: argument.optional === true || argument.optional === "true",
          semanticRole:
            typeof argument.semanticRole === "string"
              ? argument.semanticRole
              : undefined,
        })),
      },
    ];
  });
}

export async function* readOewn(
  source: ResolvedSource,
): AsyncGenerator<NormalizedSourceRecord> {
  const xml = await readXml(source.path);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });
  const document = parser.parse(xml) as XmlRecord;
  const lexicalResource = (document.LexicalResource ?? document) as XmlRecord;
  const lexicon = (array(
    lexicalResource.Lexicon as XmlRecord | XmlRecord[],
  )[0] ?? {}) as XmlRecord;
  const synsets = new Map(
    array(lexicon.Synset as XmlRecord | XmlRecord[]).map((synset) => [
      String(synset.id),
      synset,
    ]),
  );
  const lexicalEntries = array(lexicon.LexicalEntry as XmlRecord | XmlRecord[]);
  const headwordBySynset = new Map<string, string>();
  for (const entry of lexicalEntries) {
    const lemma = (entry.Lemma ?? {}) as XmlRecord;
    if (typeof lemma.writtenForm !== "string") continue;
    for (const sense of array(entry.Sense as XmlRecord | XmlRecord[])) {
      if (
        typeof sense.synset === "string" &&
        !headwordBySynset.has(sense.synset)
      ) {
        headwordBySynset.set(sense.synset, lemma.writtenForm);
      }
    }
  }

  for (const rawEntry of lexicalEntries) {
    const lemma = (rawEntry.Lemma ?? {}) as XmlRecord;
    const word = typeof lemma.writtenForm === "string" ? lemma.writtenForm : "";
    if (!word) continue;
    const partOfSpeech = normalizePartOfSpeech(
      typeof lemma.partOfSpeech === "string" ? lemma.partOfSpeech : undefined,
    );
    const senses = array(rawEntry.Sense as XmlRecord | XmlRecord[]).map(
      (rawSense, index) => {
        const synsetId =
          typeof rawSense.synset === "string" ? rawSense.synset : undefined;
        const synset = synsetId ? synsets.get(synsetId) : undefined;
        const definitions = textValues(synset?.Definition);
        const examples = textValues(synset?.Example).map((text) => ({ text }));
        const relations = array(
          synset?.SynsetRelation as XmlRecord | XmlRecord[] | undefined,
        ).flatMap((candidate) => {
          const type = relationType(candidate.relType);
          const targetExternalId =
            typeof candidate.target === "string" ? candidate.target : undefined;
          const targetText = targetExternalId
            ? headwordBySynset.get(targetExternalId)
            : undefined;
          return type && targetExternalId && targetText
            ? [{ relationType: type, targetText, targetExternalId }]
            : [];
        });
        const senseRelations = array(
          rawSense.SenseRelation as XmlRecord | XmlRecord[] | undefined,
        ).flatMap((candidate) => {
          const type = relationType(candidate.relType);
          const target =
            typeof candidate.target === "string" ? candidate.target : undefined;
          return type && target
            ? [
                {
                  relationType: type,
                  targetText: target,
                  targetExternalId: target,
                },
              ]
            : [];
        });
        return {
          sourceSenseKey:
            typeof rawSense.id === "string"
              ? rawSense.id
              : `${word}:${partOfSpeech}:${index + 1}`,
          partOfSpeech,
          definitions: definitions.map((text) => ({ languageTag: "en", text })),
          translations: [],
          examples,
          relations: [...relations, ...senseRelations],
          conceptExternalId: synsetId,
          tags: [],
          frames: syntacticFrames(
            rawEntry,
            new Set([String(rawSense.id ?? "")]),
          ),
        };
      },
    );

    yield sourceContext(source, "WN_LMF", {
      sourceKey: typeof rawEntry.id === "string" ? rawEntry.id : word,
      rawPayload: {
        entryId: typeof rawEntry.id === "string" ? rawEntry.id : null,
        lemma: word,
        partOfSpeech,
        senseIds: senses.map((sense) => sense.sourceSenseKey),
      },
      languageTag: "en",
      headword: word,
      partOfSpeech,
      senses,
      forms: [],
      phonetics: [],
      books: [],
      independentEntryEvidence: senses.length > 0,
      formOfEvidence: [],
    });
  }
}
