import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadHeadwordSet,
  loadRichTargetSet,
  parseSourceManifest,
} from "../src/manifest/source-manifest";

describe("protected pilot source manifest template", () => {
  it("binds exact-200 selection and content-addressed Kaikki materialization", async () => {
    const manifestPath = join(
      import.meta.dirname,
      "../data/pilot-source-manifest.template.json",
    );
    const manifest = parseSourceManifest(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    const headwords = await loadHeadwordSet(manifest, manifestPath);
    const richTargets = await loadRichTargetSet(manifest, manifestPath);
    const kaikki = manifest.sources.find(
      (source) => source.key === "kaikki-en",
    );

    expect(headwords?.headwords).toHaveLength(200);
    expect(richTargets?.targets.length).toBeGreaterThan(0);
    expect(kaikki).toMatchObject({
      sha256:
        "58192293df5401a76de930aa0616456abe052c8a9c88e8a2e2a2f490cf530989",
      materialization: {
        parentUri:
          "s3://lexicon-artifacts-f-0j5ng/sha256/0071ccc21e6b35bcb0d57a742eac5868e5b21b7bf7ec99b1755982ca28dbed94/raw-wiktextract-data.jsonl.gz",
        parentSha256:
          "0071ccc21e6b35bcb0d57a742eac5868e5b21b7bf7ec99b1755982ca28dbed94",
        materializerVersion: "wiktextract-headword-slice/v2",
        recordCount: 543,
      },
    });
  });
});
