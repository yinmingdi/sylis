import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ApiGenerator } from "./api-generator.mjs";

test("generated index only links projects with an entry page", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "sylis-typedoc-index-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputPath = join(root, "apis");
  await mkdir(join(root, "packages"), { recursive: true });
  await mkdir(join(root, "apps"), { recursive: true });
  await mkdir(join(outputPath, "generated-package"), { recursive: true });
  await mkdir(join(outputPath, "generated-app"), { recursive: true });
  await writeFile(
    join(outputPath, "generated-package", "index.md"),
    "# package\n",
  );
  await writeFile(join(outputPath, "generated-app", "index.md"), "# app\n");

  const generator = new ApiGenerator({ rootPath: root, outputPath });
  generator.packages = ["generated-package", "missing-package"];
  generator.apps = ["generated-app", "missing-app"];
  generator._packagesJSON = [
    { pathName: "generated-package", version: "1.0.0" },
    { pathName: "missing-package", version: "1.0.0" },
    { pathName: "generated-app", version: "1.0.0" },
    { pathName: "missing-app", version: "1.0.0" },
  ];

  const index = generator._createIndexContent();

  assert.match(index, /\.\/generated-package\/index\.md/);
  assert.match(index, /\.\/generated-app\/index\.md/);
  assert.doesNotMatch(index, /missing-package/);
  assert.doesNotMatch(index, /missing-app/);
});

test("documentation generation fails when any discovered project fails", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "sylis-typedoc-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputPath = join(root, "apis");
  await mkdir(join(root, "packages"), { recursive: true });
  await mkdir(join(root, "apps"), { recursive: true });

  const generator = new ApiGenerator({ rootPath: root, outputPath });
  generator.packages = ["working-package", "broken-package"];
  generator.apps = [];
  generator._generateSingleDoc = async (name) => {
    if (name === "broken-package") {
      throw new Error("conversion failed");
    }
    await mkdir(join(outputPath, name), { recursive: true });
    await writeFile(join(outputPath, name, "index.md"), "# generated\n");
  };

  await assert.rejects(generator.generateDocs(), {
    name: "AggregateError",
    message: "TypeDoc failed for 1 project(s).",
  });
  await assert.rejects(
    async () => readFile(join(outputPath, "index.md"), "utf8"),
    { code: "ENOENT" },
  );
});
