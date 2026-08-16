import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const safeName = (value) => value.replace(/[^a-z0-9._-]+/gi, "-");

export async function writeEvidence(command, evidence) {
  const directory = path.resolve(
    process.env.SYLIS_EVIDENCE_DIR || ".artifacts/operations",
  );
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(directory, `${timestamp}-${safeName(command)}.json`);
  const document = `${JSON.stringify(
    {
      schema: "sylis.operation-evidence/1",
      command,
      ...evidence,
    },
    null,
    2,
  )}\n`;
  await writeFile(file, document, { mode: 0o600 });
  return { file, sha256: sha256(document) };
}

export async function createEvidenceManifest() {
  const directory = path.resolve(
    process.env.SYLIS_EVIDENCE_DIR || ".artifacts/operations",
  );
  await mkdir(directory, { recursive: true });
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    if (!name.endsWith(".json") || name === "manifest.json") continue;
    const content = await readFile(path.join(directory, name));
    entries.push({ name, bytes: content.byteLength, sha256: sha256(content) });
  }
  const manifest = `${JSON.stringify(
    {
      schema: "sylis.operation-evidence-manifest/1",
      generatedAt: new Date().toISOString(),
      entries,
    },
    null,
    2,
  )}\n`;
  const file = path.join(directory, "manifest.json");
  await writeFile(file, manifest, { mode: 0o600 });
  return { file, entries: entries.length, sha256: sha256(manifest) };
}
