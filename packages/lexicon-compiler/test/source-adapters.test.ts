import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import type { SourceAdapterKind } from "../src/candidates/candidate-v1";
import type { ResolvedSource } from "../src/manifest/source-manifest";
import { readOewn } from "../src/sources/oewn";
import { readWiktextract } from "../src/sources/wiktextract";
import { readYoudao } from "../src/sources/youdao";

const fixtureRoot = resolve(import.meta.dirname, "fixtures");

function source(path: string, adapter: SourceAdapterKind): ResolvedSource {
  return {
    key: "fixture",
    version: "fixture-1",
    adapter,
    uri: path,
    sha256: "0".repeat(64),
    rights: {
      mayBuild: true,
      mayServe: true,
      mayExport: true,
      requiresAttribution: false,
    },
    path,
    sourceUri: "urn:sylis:fixture:source",
    checksum: "0".repeat(64),
  };
}

async function collect<T>(input: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of input) values.push(value);
  return values;
}

describe("source adapters", () => {
  it("maps official Wiktextract etymology fields to source-backed learning candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-wiktextract-etymology-"));
    const path = join(root, "kaikki.jsonl");
    await writeFile(
      path,
      `${JSON.stringify({
        word: "helpful",
        lang_code: "en",
        pos: "adj",
        etymology_text: "From help and the suffix -ful.",
        etymology_templates: [
          {
            name: "suffix",
            args: { "1": "en", "2": "help", "3": "ful" },
          },
        ],
        senses: [{ glosses: ["Providing useful assistance."] }],
      })}\n`,
    );

    const [record] = await collect(
      readWiktextract(source(path, "WIKTEXTRACT_EN")),
    );

    expect(record.wordFormations).toEqual([
      expect.objectContaining({
        formationType: "DERIVATION",
        inputPattern: "help + ful",
        outputPattern: "helpful",
        segments: [
          expect.objectContaining({ surfaceText: "help", role: "ROOT" }),
          expect.objectContaining({ surfaceText: "ful", role: "SUFFIX" }),
        ],
      }),
    ]);
    expect(record.senses[0]?.culturalContexts).toEqual([
      {
        languageTag: "en",
        text: "From help and the suffix -ful.",
      },
    ]);
  });

  it("gives separate Wiktextract records collision-free source identities", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-wiktextract-identity-"));
    const path = join(root, "kaikki.jsonl");
    const records = [
      {
        word: "run",
        lang_code: "en",
        pos: "verb",
        senses: [
          {
            glosses: ["past participle of rin"],
            tags: ["form-of", "participle", "past"],
            form_of: [{ word: "rin" }],
          },
        ],
      },
      {
        word: "run",
        lang_code: "en",
        pos: "verb",
        senses: [{ glosses: ["To move swiftly."] }],
      },
    ];
    await writeFile(
      path,
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );

    const parsed = await collect(
      readWiktextract(source(path, "WIKTEXTRACT_EN")),
    );

    expect(new Set(parsed.map((record) => record.sourceKey)).size).toBe(2);
    expect(new Set(parsed.map((record) => record.sourceRecordId)).size).toBe(2);
  });

  it("reads the official gzip container used by OEWN releases", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-oewn-gzip-"));
    const xmlPath = join(fixtureRoot, "oewn.xml");
    const gzipPath = join(root, "oewn-release-asset.bin");
    await writeFile(gzipPath, gzipSync(await readFile(xmlPath)));

    const plain = await collect(readOewn(source(xmlPath, "WN_LMF")));
    const compressed = await collect(readOewn(source(gzipPath, "WN_LMF")));

    expect(compressed).toEqual(plain);
    expect(compressed.length).toBeGreaterThan(0);
  });

  it("derives collision-free keys and book membership from raw Youdao books", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-youdao-books-"));
    const path = join(root, "youdao.ndjson");
    const record = (bookId: string, wordId: string, wordRank: number) => ({
      wordRank,
      headWord: "cancel",
      content: {
        word: {
          wordHead: "cancel",
          wordId,
          content: {
            trans: [
              {
                pos: "verb",
                tranCn: "取消",
                tranOther: "to decide that a planned event will not happen",
              },
            ],
          },
        },
      },
      bookId,
    });
    await writeFile(
      path,
      `${JSON.stringify(record("CET4_3", "CET4_3_1", 1))}\n${JSON.stringify(record("IELTS_3", "IELTS_3_9", 9))}\n`,
    );

    const records = await collect(readYoudao(source(path, "YOUDAO_NDJSON")));

    expect(records.map((value) => value.sourceKey)).toEqual([
      "CET4_3:CET4_3_1",
      "IELTS_3:IELTS_3_9",
    ]);
    expect(new Set(records.map((value) => value.sourceRecordId)).size).toBe(2);
    expect(records.map((value) => value.books)).toEqual([
      [{ bookKey: "CET4_3", title: "CET4_3", rank: 1 }],
      [{ bookKey: "IELTS_3", title: "IELTS_3", rank: 9 }],
    ]);
  });
});
