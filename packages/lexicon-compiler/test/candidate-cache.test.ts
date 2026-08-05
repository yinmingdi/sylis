import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { EncryptedFileCandidateCache } from "../src/enrich/candidate-cache";

describe("encrypted candidate cache", () => {
  it("persists reusable candidates without storing their plaintext", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-ai-cache-"));
    const path = join(root, "candidates.enc.json");
    const key = Buffer.alloc(32, 7).toString("base64");
    const value = {
      value: { definition: "plaintext-must-not-leak" },
      provider: "fake",
      model: "fake",
      providerRequestId: null,
      usage: { inputTokens: 1, outputTokens: 1, cacheHitTokens: 0 },
    };
    await new EncryptedFileCandidateCache(path, key).set("candidate-1", value);
    expect(await readFile(path, "utf8")).not.toContain(
      "plaintext-must-not-leak",
    );
    await expect(
      new EncryptedFileCandidateCache(path, key).get("candidate-1"),
    ).resolves.toEqual(value);
  });

  it("serializes concurrent atomic writes without losing candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-ai-cache-concurrent-"));
    const path = join(root, "candidates.enc.json");
    const key = Buffer.alloc(32, 9).toString("base64");
    const cache = new EncryptedFileCandidateCache(path, key);
    const values = Array.from({ length: 8 }, (_, index) => ({
      value: { index },
      provider: "fake",
      model: "fake",
      providerRequestId: null,
      usage: { inputTokens: index, outputTokens: 1, cacheHitTokens: 0 },
    }));

    await Promise.all(
      values.map((value, index) => cache.set(`candidate-${index}`, value)),
    );
    const reopened = new EncryptedFileCandidateCache(path, key);
    await Promise.all(
      values.map(async (value, index) => {
        await expect(reopened.get(`candidate-${index}`)).resolves.toEqual(
          value,
        );
      }),
    );
  });
});
