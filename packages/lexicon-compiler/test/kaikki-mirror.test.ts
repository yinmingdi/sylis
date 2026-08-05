import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  mirrorKaikkiSource,
  parseKaikkiVersionIdentity,
} from "../src/materialize/kaikki-mirror";

const WIKTEXTRACT_COMMIT = "d9fa2335957c9089ce2c3fb110a075cf072903da";
const WIKITEXTPROCESSOR_COMMIT = "9e92f4b53a98748f849ef6186617535abb0fca7b";

function metadata(extractionDate = "2026-08-02"): string {
  return `<p>The current version was extracted from the <a>enwiktionary dump</a> dated 2026-07-06.</p>
    <p>structured data extracted on ${extractionDate} from the enwiktionary dump
    <a href="https://github.com/tatuylonen/wiktextract/commit/${WIKTEXTRACT_COMMIT}">wiktextract</a>
    <a href="https://github.com/tatuylonen/wikitextprocessor/commit/${WIKITEXTPROCESSOR_COMMIT}">wikitextprocessor</a></p>`;
}

describe("Kaikki content-addressed mirror", () => {
  it("parses all four upstream version coordinates", () => {
    expect(parseKaikkiVersionIdentity(metadata())).toEqual({
      dumpDate: "2026-07-06",
      extractionDate: "2026-08-02",
      wiktextractCommit: WIKTEXTRACT_COMMIT,
      wikitextprocessorCommit: WIKITEXTPROCESSOR_COMMIT,
    });
  });

  it("checks metadata before and after downloading and installs by SHA-256", async () => {
    const source = gzipSync('{"word":"cancel","lang_code":"en"}\n');
    const server = createServer((request, response) => {
      if (request.url === "/metadata") {
        response.setHeader("content-type", "text/html");
        response.end(metadata());
        return;
      }
      if (request.url === "/source") {
        response.setHeader("content-length", source.length);
        response.setHeader("etag", '"fixture-etag"');
        response.end(source);
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing port.");
      const root = await mkdtemp(join(tmpdir(), "sylis-kaikki-mirror-"));
      const progress: string[] = [];
      const result = await mirrorKaikkiSource({
        metadataUrl: `http://127.0.0.1:${address.port}/metadata`,
        sourceUrl: `http://127.0.0.1:${address.port}/source`,
        mirrorRoot: root,
        progress: { report: (event) => progress.push(event.stage) },
      });

      expect(result.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.byteSize).toBe(source.length);
      expect(await readFile(fileURLToPath(result.mirrorUri))).toEqual(source);
      expect(result.version.extractionDate).toBe("2026-08-02");
      expect(progress).toEqual([
        "METADATA_BEFORE",
        "DOWNLOAD",
        "DOWNLOAD",
        "METADATA_AFTER",
        "INSTALL",
      ]);
    } finally {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    }
  });

  it("rejects bytes when the upstream version changes during download", async () => {
    const source = gzipSync('{"word":"cancel","lang_code":"en"}\n');
    let metadataRequests = 0;
    const server = createServer((request, response) => {
      if (request.url === "/metadata") {
        metadataRequests += 1;
        response.end(
          metadata(metadataRequests === 1 ? "2026-08-02" : "2026-08-03"),
        );
        return;
      }
      if (request.url === "/source") {
        response.setHeader("content-length", source.length);
        response.end(source);
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing port.");
      const root = await mkdtemp(join(tmpdir(), "sylis-kaikki-changing-"));
      await expect(
        mirrorKaikkiSource({
          metadataUrl: `http://127.0.0.1:${address.port}/metadata`,
          sourceUrl: `http://127.0.0.1:${address.port}/source`,
          mirrorRoot: root,
        }),
      ).rejects.toThrow(
        "Kaikki version changed while the source was downloading.",
      );
      await expect(readFile(join(root, "sha256"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    }
  });
});
