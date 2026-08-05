import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const pilotScript = resolve(
  repositoryRoot,
  "tools/architecture/run-phase-1-pilot.mjs",
);
const pilotPreparationScript = resolve(
  repositoryRoot,
  "tools/architecture/prepare-phase-1-pilot.mjs",
);
const cleanCommitModule = resolve(
  repositoryRoot,
  "tools/architecture/phase-1-clean-commit.mjs",
);

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${program} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function runPilot(script, workspace, env) {
  return spawnSync(process.execPath, [script], {
    cwd: workspace,
    env,
    encoding: "utf8",
  });
}

test("revalidates frozen pilot bytes after approval without regenerating", async () => {
  const root = await mkdtemp(join(tmpdir(), "sylis-phase-1-pilot-"));
  const workspace = join(root, "workspace");
  const script = join(workspace, "tools/architecture/run-phase-1-pilot.mjs");
  const preparationScript = join(
    workspace,
    "tools/architecture/prepare-phase-1-pilot.mjs",
  );
  const cleanCommitScript = join(
    workspace,
    "tools/architecture/phase-1-clean-commit.mjs",
  );
  const fakeBin = join(root, "bin");
  const fakePnpm = join(fakeBin, "pnpm");
  const fakePnpmScript = join(root, "fake-pnpm.mjs");
  const fakeStatePath = join(root, "fake-pnpm-state.json");
  const manifestTemplatePath = join(
    workspace,
    "pilot-source-manifest.template.json",
  );
  const manifestPath = join(
    workspace,
    ".work/phase-1-pilot-input/source-manifest.json",
  );
  const reviewPath = join(root, "pilot-review.json");

  await mkdir(dirname(script), { recursive: true });
  await mkdir(join(workspace, "data"), { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await writeFile(script, await readFile(pilotScript, "utf8"));
  await writeFile(
    preparationScript,
    await readFile(pilotPreparationScript, "utf8"),
  );
  await writeFile(cleanCommitScript, await readFile(cleanCommitModule, "utf8"));
  await writeFile(join(workspace, ".gitignore"), ".work/\n");
  await writeFile(join(workspace, "data/source.jsonl"), "{}\n");
  await writeFile(join(workspace, "data/headwords.json"), "{}\n");
  await writeFile(join(workspace, "data/rich-targets.json"), "{}\n");
  await writeFile(
    manifestTemplatePath,
    JSON.stringify({
      manifestVersion: "sylis.source-manifest/1",
      release: { gitCommit: "0".repeat(40) },
      sources: [{ uri: "./data/source.jsonl" }],
      selection: {
        headwordSet: { path: "./data/headwords.json" },
      },
      pedagogy: {
        richTargetSet: { path: "./data/rich-targets.json" },
      },
    }),
  );
  await writeFile(
    fakePnpm,
    '#!/bin/sh\nexec "$FAKE_NODE" "$FAKE_PNPM_SCRIPT" "$@"\n',
  );
  await chmod(fakePnpm, 0o755);
  await writeFile(
    fakePnpmScript,
    `
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const statePath = process.env.FAKE_PNPM_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const isCompile = args.includes("compile");
const isValidate = args.includes("validate");

if (isCompile) {
  const output = args[args.indexOf("--output") + 1];
  const ai = args.includes("--ai");
  state.compileCount += 1;
  if (ai) state.aiCompileCount += 1;
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(output, ai ? "frozen-ai-artifact" : "frozen-no-ai-artifact");
  const firstAi = ai && state.aiCompileCount === 1;
  const model = process.env.LEXICON_AI_MODEL;
  process.stdout.write(JSON.stringify({
    runId: ai ? "ai-run" : "no-ai-run",
    sourceRecordCount: 200,
    headwordCount: 200,
    contentHash: ai ? "sha256:ai-content" : "sha256:no-ai-content",
    aiMetrics: ai ? {
      taskCount: 1,
      taskCounts: { TEST: 1 },
      providerCalls: firstAi ? 1 : 0,
      cacheHits: firstAi ? 0 : 1,
      inputTokens: firstAi ? 10 : 0,
      outputTokens: firstAi ? 2 : 0,
      providerCacheHitTokens: 0,
      costMicros: firstAi ? 12 : 0,
      validationRejects: 0
    } : null,
    artifactManifest: {
      build: { compileProfile: "pilot-200", validatorVersion: "test/1" },
      inputs: { sources: [] },
      ai: ai ? {
        enabled: true,
        requestedIdentity: { provider: "deepseek", model },
        resolvedIdentity: { provider: "deepseek", model }
      } : {
        enabled: false,
        requestedIdentity: null,
        resolvedIdentity: null
      }
    }
  }));
} else if (isValidate) {
  const input = args[args.indexOf("--input") + 1];
  const ai = readFileSync(input, "utf8") === "frozen-ai-artifact";
  process.stdout.write(JSON.stringify({
    valid: true,
    contentHash: ai ? "sha256:ai-content" : "sha256:no-ai-content",
    profileSummary: [{
      key: "LEXICON_PUBLISHABLE",
      evaluatedTargets: 200,
      statuses: { PRESENT: 200 }
    }],
    coverageSummary: [],
    exerciseStatistics: [
      "LEARNER_EXPLANATION",
      "MORPHOLOGY_WALKTHROUGH",
      "CULTURAL_CONTEXT",
      "MNEMONIC",
      "MICRO_STORY"
    ].map((kind) => ({ key: \`material:\${kind}\`, count: 1 })),
    sample: [{ headwordId: "headword-1" }]
  }));
} else {
  process.stderr.write("Unexpected fake pnpm command");
  process.exitCode = 1;
}
`,
  );
  await writeFile(
    fakeStatePath,
    JSON.stringify({ compileCount: 0, aiCompileCount: 0 }),
  );

  run("git", ["init", "--quiet"], { cwd: workspace });
  run("git", ["config", "user.email", "test@example.invalid"], {
    cwd: workspace,
  });
  run("git", ["config", "user.name", "Phase Pilot Test"], {
    cwd: workspace,
  });
  run("git", ["add", "."], { cwd: workspace });
  run("git", ["commit", "--quiet", "-m", "fixture"], { cwd: workspace });
  const commit = run("git", ["rev-parse", "HEAD"], { cwd: workspace });
  await writeFile(
    join(workspace, "unrelated-local-note.txt"),
    "This untracked file is outside Phase 1 ownership.\n",
  );
  run(
    process.execPath,
    [
      preparationScript,
      "--template",
      manifestTemplatePath,
      "--output",
      manifestPath,
    ],
    { cwd: workspace },
  );
  const preparedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(preparedManifest.release.gitCommit, commit);
  assert.equal(
    preparedManifest.sources[0].uri,
    join(workspace, "data/source.jsonl"),
  );
  assert.equal(
    preparedManifest.selection.headwordSet.path,
    join(workspace, "data/headwords.json"),
  );
  assert.equal(
    preparedManifest.pedagogy.richTargetSet.path,
    join(workspace, "data/rich-targets.json"),
  );

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    FAKE_NODE: process.execPath,
    FAKE_PNPM_SCRIPT: fakePnpmScript,
    FAKE_PNPM_STATE: fakeStatePath,
    LEXICON_SOURCE_MANIFEST: manifestPath,
    LEXICON_AI_API_KEY: "test-api-key",
    LEXICON_AI_MODEL: "test-model",
    LEXICON_AI_CACHE_KEY: "test-cache-key",
    LEXICON_AI_BUDGET_USD: "1.00",
    LEXICON_AI_CONCURRENCY: "2",
    LEXICON_AI_INPUT_USD_PER_MILLION: "1",
    LEXICON_AI_OUTPUT_USD_PER_MILLION: "2",
  };
  const first = runPilot(script, workspace, env);
  assert.equal(first.status, 1);
  assert.match(first.stderr, /Manual sample review is required/);

  const outputRoot = join(workspace, ".work/phase-1-pilot");
  const request = JSON.parse(
    await readFile(join(outputRoot, "review-request.json"), "utf8"),
  );
  await writeFile(
    reviewPath,
    JSON.stringify({
      ...request,
      reviewer: "phase-pilot-test",
      approved: true,
      reviewedHeadwordIds: request.sample.map((sample) => sample.headwordId),
      notes: "Approved in the orchestration regression test.",
    }),
  );
  const firstFakeState = JSON.parse(await readFile(fakeStatePath, "utf8"));
  assert.deepEqual(firstFakeState, { compileCount: 3, aiCompileCount: 2 });

  const approvalEnv = { ...env, LEXICON_PILOT_REVIEW_FILE: reviewPath };
  delete approvalEnv.LEXICON_AI_API_KEY;
  delete approvalEnv.LEXICON_AI_CACHE_KEY;
  const second = runPilot(script, workspace, approvalEnv);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /exact-200 pilot passed/);
  assert.deepEqual(JSON.parse(await readFile(fakeStatePath, "utf8")), {
    compileCount: 3,
    aiCompileCount: 2,
  });
  const stateSource = await readFile(
    join(outputRoot, "pilot-state.json"),
    "utf8",
  );
  assert.doesNotMatch(stateSource, /test-api-key|test-cache-key/);
  const evidence = JSON.parse(
    await readFile(join(outputRoot, "evidence.json"), "utf8"),
  );
  assert.equal(evidence.commit, commit);
  assert.equal(evidence.manualReview.approved, true);
});
