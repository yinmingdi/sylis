import {
  AssetMimeType,
  AssetParserKind,
  AssetScanStatus,
} from "@sylis/agent-contracts";
import { describe, expect, it } from "vitest";

import { extractText, inspectAsset } from "../src/processing/safe-content";

const limits = {
  maxAssetBytes: 1_000_000,
  maxArchiveEntries: 100,
  maxArchiveEntryBytes: 1_000_000,
  maxArchiveExpandedBytes: 2_000_000,
  maxArchiveCompressionRatio: 100,
  maxDocumentPages: 100,
  maxImagePixels: 10_000_000,
  maxExtractedCharacters: 1_000_000,
  parserTimeoutMs: 1_000,
};

describe("JSON asset processing", () => {
  it("preserves JSON MIME identity and extracts UTF-8 text", async () => {
    const body = Buffer.from('{"artifactKind":"ARTICLE"}', "utf8");

    await expect(
      inspectAsset(body, AssetMimeType.APPLICATION_JSON, limits),
    ).resolves.toMatchObject({
      status: AssetScanStatus.READY,
      detectedMimeType: AssetMimeType.APPLICATION_JSON,
    });
    await expect(
      extractText(body, AssetMimeType.APPLICATION_JSON, limits),
    ).resolves.toMatchObject({
      parser: AssetParserKind.JSON,
      text: '{"artifactKind":"ARTICLE"}',
    });
  });

  it("rejects malformed JSON declared as application/json", async () => {
    const body = Buffer.from('{"artifactKind":', "utf8");
    await expect(
      inspectAsset(body, AssetMimeType.APPLICATION_JSON, limits),
    ).rejects.toThrow("ASSET_JSON_INVALID");
  });
});
