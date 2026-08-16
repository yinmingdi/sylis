import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const listed = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: workspaceRoot, encoding: "utf8" },
);

if (listed.status !== 0) {
  console.error("Unable to enumerate repository files for secret scanning.");
  process.exit(1);
}

const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp",
  ".zip",
  ".zst",
]);
const tokenRules = [
  ["private-key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/],
  ["provider-api-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  ],
  ["aws-access-key", /\bAKIA[A-Z0-9]{16}\b/],
];
const assignmentPattern =
  /\b(RAILWAY_TOKEN|DEEPSEEK_API_KEY|OPENAI_API_KEY|AI_API_KEY)\s*[:=]\s*["']?([^\s"'#]+)/g;
const safeValuePattern =
  /^(?:\$\{|\$\{\{|<|ci-|test-|your-|example|placeholder|process\.env)/i;
const placeholderValuePattern =
  /(?:placeholder|your[-_]|example|dummy|(?:^|[-_])change(?:[-_]|$)|(?:^|[-_])replace(?:[-_]|$)|not-for-production)/i;
const findings = [];

for (const relativePath of listed.stdout.split("\0").filter(Boolean)) {
  const path = resolve(workspaceRoot, relativePath);
  if (!existsSync(path)) continue;
  if (binaryExtensions.has(extname(path).toLowerCase())) continue;
  if (statSync(path).size > 5 * 1024 * 1024) continue;

  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;

  for (const [rule, pattern] of tokenRules) {
    const match = content.match(pattern);
    if (match) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relativePath}:${line} (${rule})`);
    }
  }
  for (const match of content.matchAll(assignmentPattern)) {
    if (
      !safeValuePattern.test(match[2]) &&
      !placeholderValuePattern.test(match[2])
    ) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relativePath}:${line} (secret-assignment)`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found (values redacted):");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Repository secret scan passed (values never printed).");
