import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { materializeSourceSlice } from "../src/materialize/source-slice";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function headwordFixture(root: string) {
  const path = join(root, "headwords.json");
  const bytes = `${JSON.stringify(
    {
      headwordSetVersion: "sylis.headword-set/1",
      version: "test-en-v1",
      headwords: [
        { languageTag: "en", normalizedHeadword: "apple" },
        { languageTag: "en", normalizedHeadword: "cancel" },
      ],
    },
    null,
    2,
  )}\n`;
  await writeFile(path, bytes);
  return { path, sha256: sha256(bytes) };
}

describe("source materialization", () => {
  it("preserves complete ECDICT rows and emits a deterministic sorted slice", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-ecdict-slice-"));
    const parentPath = join(root, "ecdict.csv");
    const parent =
      'word,definition,translation\ncancel,"to stop\na planned event",取消\napple,fruit,苹果\ncancel,abolish,废止\nignored,unused,忽略\n';
    await writeFile(parentPath, parent);
    const headwords = await headwordFixture(root);
    const progress: string[] = [];

    const first = await materializeSourceSlice({
      adapter: "ECDICT",
      inputPath: parentPath,
      outputPath: join(root, "first.csv"),
      metadataOutputPath: join(root, "first.slice.json"),
      parentUri: "https://sources.example/ecdict.csv",
      parentSha256: sha256(parent),
      headwordSetPath: headwords.path,
      headwordSetVersion: "test-en-v1",
      headwordSetSha256: headwords.sha256,
      progress: { report: (event) => progress.push(event.stage) },
    });
    const second = await materializeSourceSlice({
      adapter: "ECDICT",
      inputPath: parentPath,
      outputPath: join(root, "second.csv"),
      metadataOutputPath: join(root, "second.slice.json"),
      parentUri: "https://sources.example/ecdict.csv",
      parentSha256: sha256(parent),
      headwordSetPath: headwords.path,
      headwordSetVersion: "test-en-v1",
      headwordSetSha256: headwords.sha256,
    });
    const output = await readFile(join(root, "first.csv"), "utf8");

    expect(output).toBe(await readFile(join(root, "second.csv"), "utf8"));
    expect(
      output.startsWith("word,definition,translation\napple,fruit,苹果\n"),
    ).toBe(true);
    expect(output).toContain('cancel,"to stop\na planned event",取消\n');
    expect(output).toContain("cancel,abolish,废止\n");
    expect(output).not.toContain("ignored");
    expect(first).toEqual(second);
    expect(first.output.recordCount).toBe(3);
    expect(first.selection).toMatchObject({
      headwordCount: 2,
      matchedHeadwordCount: 2,
    });
    expect([...new Set(progress)]).toEqual([
      "VERIFY_PARENT",
      "SCAN",
      "WRITE",
      "INSTALL",
    ]);
  });

  it("keeps every selected English Kaikki record and excludes other languages", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-kaikki-slice-"));
    const parentPath = join(root, "kaikki.jsonl.gz");
    const records = [
      { word: "cancel", lang_code: "en", pos: "verb", etymology_number: 2 },
      { word: "cancel", lang_code: "fr", pos: "verb" },
      { word: "apple", lang_code: "en", pos: "noun" },
      { word: "cancel", lang_code: "en", pos: "noun", etymology_number: 1 },
      { word: "ignored", lang_code: "en", pos: "adjective" },
    ];
    const parent = gzipSync(
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
    await writeFile(parentPath, parent);
    const headwords = await headwordFixture(root);

    const result = await materializeSourceSlice({
      adapter: "WIKTEXTRACT_EN",
      inputPath: parentPath,
      outputPath: join(root, "kaikki.slice.jsonl"),
      metadataOutputPath: join(root, "kaikki.slice.json"),
      parentUri: "https://objects.example/sha256/parent/raw.jsonl.gz",
      parentSha256: sha256(parent),
      headwordSetPath: headwords.path,
      headwordSetVersion: "test-en-v1",
      headwordSetSha256: headwords.sha256,
    });
    const outputRecords = (
      await readFile(join(root, "kaikki.slice.jsonl"), "utf8")
    )
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(outputRecords.map((record) => record.word)).toEqual([
      "apple",
      "cancel",
      "cancel",
    ]);
    expect(outputRecords.map((record) => record.pos)).toEqual([
      "noun",
      "noun",
      "verb",
    ]);
    expect(outputRecords.every((record) => record.lang_code === "en")).toBe(
      true,
    );
    expect(result.output.recordCount).toBe(3);
    expect(result.materializerVersion).toBe("wiktextract-headword-slice/v2");
    expect(result.parent.sha256).toBe(`sha256:${sha256(parent)}`);
  });

  it("repairs physical newlines inside Kaikki JSON strings", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-kaikki-newline-"));
    const parentPath = join(root, "kaikki.jsonl.gz");
    const source = await readFile(
      join(import.meta.dirname, "fixtures/kaikki-unescaped-newline.jsonl"),
    );
    const parent = gzipSync(source);
    await writeFile(parentPath, parent);
    const headwords = await headwordFixture(root);

    const result = await materializeSourceSlice({
      adapter: "WIKTEXTRACT_EN",
      inputPath: parentPath,
      outputPath: join(root, "kaikki.slice.jsonl"),
      metadataOutputPath: join(root, "kaikki.slice.json"),
      parentUri: "https://objects.example/sha256/parent/raw.jsonl.gz",
      parentSha256: sha256(parent),
      headwordSetPath: headwords.path,
      headwordSetVersion: "test-en-v1",
      headwordSetSha256: headwords.sha256,
    });
    const output = await readFile(join(root, "kaikki.slice.jsonl"), "utf8");
    const parsed = JSON.parse(output) as {
      senses: Array<{ glosses: string[] }>;
    };

    expect(output.trimEnd().split("\n")).toHaveLength(1);
    expect(parsed.senses[0]?.glosses[0]).toBe("first line\n\nsecond line");
    expect(result.output.recordCount).toBe(1);
    expect(result.materializerVersion).toBe("wiktextract-headword-slice/v2");
  });

  it("rejects other malformed Kaikki JSON without exposing its payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-kaikki-invalid-"));
    const parentPath = join(root, "kaikki.jsonl.gz");
    const invalidLine = '{"word":"sensitive-marker",}\n';
    const parent = gzipSync(invalidLine);
    await writeFile(parentPath, parent);
    const headwords = await headwordFixture(root);
    const expectedLineHash = sha256(invalidLine.trimEnd());

    let failure: Error | null = null;
    try {
      await materializeSourceSlice({
        adapter: "WIKTEXTRACT_EN",
        inputPath: parentPath,
        outputPath: join(root, "kaikki.slice.jsonl"),
        metadataOutputPath: join(root, "kaikki.slice.json"),
        parentUri: "https://objects.example/sha256/parent/raw.jsonl.gz",
        parentSha256: sha256(parent),
        headwordSetPath: headwords.path,
        headwordSetVersion: "test-en-v1",
        headwordSetSha256: headwords.sha256,
      });
    } catch (error) {
      failure = error as Error;
    }

    expect(failure?.message).toContain("physical line 1");
    expect(failure?.message).toContain(`sha256:${expectedLineHash}`);
    expect(failure?.message).not.toContain("sensitive-marker");
  });
});
