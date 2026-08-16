import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { afterEach, describe, expect, it } from "vitest";

import { createSingleFrameZstdCompress, inspectSingleZstdFrame } from "../src";

const temporaryRoots: string[] = [];

describe("single-frame zstd envelope", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => rm(root, { force: true, recursive: true })),
    );
  });

  it("keeps multiple input writes inside one zstd frame", async () => {
    const root = await mkdtemp(join(tmpdir(), "sylis-zstd-envelope-"));
    temporaryRoots.push(root);
    const path = join(root, "fixture.json.zst");

    await pipeline(
      Readable.from(['{"first":', '"second"}']),
      createSingleFrameZstdCompress(),
      createWriteStream(path),
    );

    await expect(inspectSingleZstdFrame(path)).resolves.toBeGreaterThan(0);
  });
});
