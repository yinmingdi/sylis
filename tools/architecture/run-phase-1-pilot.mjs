import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { assertPhase1CleanCommit } from "./phase-1-clean-commit.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = resolve(workspaceRoot, ".work/phase-1-pilot");
const statePath = resolve(outputRoot, "pilot-state.json");
const reviewRequestPath = resolve(outputRoot, "review-request.json");
const evidencePath = resolve(outputRoot, "evidence.json");
const noAiOutput = resolve(outputRoot, "pilot-200-no-ai.json.zst");
const aiFirstOutput = resolve(outputRoot, "pilot-200-ai-first.json.zst");
const aiSecondOutput = resolve(outputRoot, "pilot-200-ai-second.json.zst");
const sharedWork = resolve(outputRoot, "compiler-work");

const reviewFile = process.env.LEXICON_PILOT_REVIEW_FILE;
const requiredEnvironment = [
  "LEXICON_SOURCE_MANIFEST",
  "LEXICON_AI_MODEL",
  "LEXICON_AI_BUDGET_USD",
  "LEXICON_AI_CONCURRENCY",
  "LEXICON_AI_INPUT_USD_PER_MILLION",
  "LEXICON_AI_OUTPUT_USD_PER_MILLION",
  ...(reviewFile ? [] : ["LEXICON_AI_API_KEY", "LEXICON_AI_CACHE_KEY"]),
];
const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing protected pilot variables: ${missing.join(", ")}`);
}

function command(program, args, options = {}) {
  process.stdout.write(`\n$ ${program} ${args.join(" ")}\n`);
  const result = spawnSync(program, args, {
    cwd: workspaceRoot,
    env: { ...process.env, NX_DAEMON: "false" },
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${program} failed with exit code ${result.status ?? 1}.`);
  }
  if (options.relayStderr && result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result.stdout?.trim() ?? "";
}

function parseCommandJson(output) {
  const start = Math.max(
    output.lastIndexOf("\n{"),
    output.startsWith("{") ? 0 : -1,
  );
  if (start < 0) throw new Error("Command did not emit a JSON result.");
  return JSON.parse(output.slice(start === 0 ? 0 : start + 1));
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writePrivateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

assertPhase1CleanCommit(workspaceRoot);
const commit = command("git", ["rev-parse", "HEAD"], { capture: true });
const manifest = resolve(process.env.LEXICON_SOURCE_MANIFEST);
const manifestBytes = readFileSync(manifest);
const manifestDocument = JSON.parse(manifestBytes.toString("utf8"));
if (manifestDocument.release?.gitCommit !== commit) {
  throw new Error(
    `Protected pilot manifest release.gitCommit must equal clean HEAD ${commit}.`,
  );
}
const sourceManifest = {
  schemaVersion: manifestDocument.manifestVersion,
  sha256: sha256(manifestBytes),
};
const buildConfiguration = {
  requestedModel: process.env.LEXICON_AI_MODEL,
  budget: {
    limitUsd: process.env.LEXICON_AI_BUDGET_USD,
    concurrency: Number(process.env.LEXICON_AI_CONCURRENCY),
    pricing: {
      inputUsdPerMillion: process.env.LEXICON_AI_INPUT_USD_PER_MILLION,
      outputUsdPerMillion: process.env.LEXICON_AI_OUTPUT_USD_PER_MILLION,
      cacheHitUsdPerMillion:
        process.env.LEXICON_AI_CACHE_HIT_USD_PER_MILLION ?? null,
    },
  },
};

function compile(output, workRoot, ai) {
  const args = [
    "--filter",
    "@sylis/lexicon-compiler",
    "compile",
    "--manifest",
    manifest,
    "--profile",
    "pilot-200",
    "--output",
    output,
    "--work-root",
    workRoot,
  ];
  if (ai) {
    args.push(
      "--ai",
      "--ai-budget-usd",
      process.env.LEXICON_AI_BUDGET_USD,
      "--ai-concurrency",
      process.env.LEXICON_AI_CONCURRENCY,
      "--ai-input-usd-per-million",
      process.env.LEXICON_AI_INPUT_USD_PER_MILLION,
      "--ai-output-usd-per-million",
      process.env.LEXICON_AI_OUTPUT_USD_PER_MILLION,
    );
    if (process.env.LEXICON_AI_CACHE_HIT_USD_PER_MILLION) {
      args.push(
        "--ai-cache-hit-usd-per-million",
        process.env.LEXICON_AI_CACHE_HIT_USD_PER_MILLION,
      );
    }
  }
  const compileResult = parseCommandJson(
    command("pnpm", args, { capture: true, relayStderr: true }),
  );
  return { compileResult, validation: validate(output) };
}

function validate(output) {
  return JSON.parse(
    command(
      "pnpm",
      ["--filter", "@sylis/lexicon-compiler", "validate", "--input", output],
      { capture: true },
    ),
  );
}

function artifactSha256(path) {
  return sha256(readFileSync(path));
}

function assertPilotResults(noAiValidation, firstValidation, secondValidation) {
  for (const [name, result] of [
    ["no-AI", noAiValidation],
    ["first AI", firstValidation],
    ["cached AI", secondValidation],
  ]) {
    if (result.compileResult.headwordCount !== 200) {
      throw new Error(
        `${name} pilot must publish exactly 200 Headwords; received ${result.compileResult.headwordCount}.`,
      );
    }
    if (result.compileResult.contentHash !== result.validation.contentHash) {
      throw new Error(`${name} compile and validation content hashes differ.`);
    }
    const publishable = result.validation.profileSummary.find(
      (profile) => profile.key === "LEXICON_PUBLISHABLE",
    );
    if (
      !publishable ||
      publishable.evaluatedTargets === 0 ||
      Object.keys(publishable.statuses).some((entry) => entry !== "PRESENT")
    ) {
      throw new Error(`${name} pilot contains a non-publishable Entry.`);
    }
    if (
      result.validation.coverageSummary.some(
        (coverage) => coverage.status === "REJECTED" && coverage.count > 0,
      )
    ) {
      throw new Error(`${name} pilot contains rejected profile coverage.`);
    }
  }

  const requiredSourceMaterialKinds = [
    "LEARNER_EXPLANATION",
    "MORPHOLOGY_WALKTHROUGH",
    "CULTURAL_CONTEXT",
  ];
  const requiredAiMaterialKinds = [
    ...requiredSourceMaterialKinds,
    "MNEMONIC",
    "MICRO_STORY",
  ];
  for (const [name, result, requiredKinds] of [
    ["no-AI", noAiValidation, requiredSourceMaterialKinds],
    ["first AI", firstValidation, requiredAiMaterialKinds],
    ["cached AI", secondValidation, requiredAiMaterialKinds],
  ]) {
    const statistics = new Map(
      result.validation.exerciseStatistics.map(({ key, count }) => [
        key,
        count,
      ]),
    );
    const missingKinds = requiredKinds.filter(
      (kind) => (statistics.get(`material:${kind}`) ?? 0) < 1,
    );
    if (missingKinds.length > 0) {
      throw new Error(
        `${name} pilot does not cover required pedagogical materials: ${missingKinds.join(", ")}.`,
      );
    }
  }

  const firstAiMetrics = firstValidation.compileResult.aiMetrics;
  const cachedAiMetrics = secondValidation.compileResult.aiMetrics;
  if (
    !firstAiMetrics ||
    firstAiMetrics.taskCount < 1 ||
    firstAiMetrics.providerCalls < 1 ||
    firstAiMetrics.validationRejects !== 0
  ) {
    throw new Error(
      "The first AI pilot did not execute a valid provider workload.",
    );
  }
  if (
    !cachedAiMetrics ||
    cachedAiMetrics.taskCount !== firstAiMetrics.taskCount ||
    cachedAiMetrics.providerCalls !== 0 ||
    cachedAiMetrics.cacheHits !== cachedAiMetrics.taskCount ||
    cachedAiMetrics.costMicros !== 0 ||
    cachedAiMetrics.validationRejects !== 0
  ) {
    throw new Error(
      "The second AI pilot did not replay every task from the encrypted candidate cache.",
    );
  }

  const firstBytes = readFileSync(aiFirstOutput);
  const secondBytes = readFileSync(aiSecondOutput);
  if (!firstBytes.equals(secondBytes)) {
    throw new Error(
      "The protected AI pilot was not byte-for-byte deterministic with its response cache.",
    );
  }
  const noAiArtifactManifest = noAiValidation.compileResult.artifactManifest;
  const firstAiArtifactManifest =
    firstValidation.compileResult.artifactManifest;
  const cachedAiArtifactManifest =
    secondValidation.compileResult.artifactManifest;
  if (
    noAiArtifactManifest.build.compileProfile !== "pilot-200" ||
    noAiArtifactManifest.ai.enabled !== false ||
    firstAiArtifactManifest.build.compileProfile !== "pilot-200" ||
    firstAiArtifactManifest.ai.enabled !== true ||
    firstAiArtifactManifest.ai.requestedIdentity.provider !== "deepseek" ||
    firstAiArtifactManifest.ai.requestedIdentity.model !==
      process.env.LEXICON_AI_MODEL ||
    firstAiArtifactManifest.ai.resolvedIdentity.provider !== "deepseek" ||
    !firstAiArtifactManifest.ai.resolvedIdentity.model ||
    !sameJson(firstAiArtifactManifest, cachedAiArtifactManifest)
  ) {
    throw new Error(
      "Protected pilot artifact manifests do not bind the approved profile and AI identity.",
    );
  }
  return { firstBytes, noAiArtifactManifest, firstAiArtifactManifest };
}

function reviewRequestFor(firstValidation, pilotStateSha256) {
  return {
    reviewVersion: "sylis.phase-1-pilot-review/1",
    commit,
    pilotStateSha256,
    artifactContentHash: firstValidation.validation.contentHash,
    sample: firstValidation.validation.sample,
    profileSummary: firstValidation.validation.profileSummary,
    coverageSummary: firstValidation.validation.coverageSummary,
    reviewer: "",
    approved: false,
    reviewedHeadwordIds: [],
    notes: "",
  };
}

let noAiValidation;
let firstValidation;
let secondValidation;

if (!reviewFile) {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  noAiValidation = compile(noAiOutput, sharedWork, false);
  firstValidation = compile(aiFirstOutput, sharedWork, true);
  secondValidation = compile(aiSecondOutput, sharedWork, true);
  assertPilotResults(noAiValidation, firstValidation, secondValidation);

  const state = {
    stateVersion: "sylis.phase-1-pilot-state/1",
    commit,
    sourceManifest,
    buildConfiguration,
    noAi: {
      ...noAiValidation,
      artifactSha256: artifactSha256(noAiOutput),
    },
    aiFirst: {
      ...firstValidation,
      artifactSha256: artifactSha256(aiFirstOutput),
    },
    aiCachedReplay: {
      ...secondValidation,
      artifactSha256: artifactSha256(aiSecondOutput),
    },
  };
  writePrivateJson(statePath, state);
  writePrivateJson(
    reviewRequestPath,
    reviewRequestFor(firstValidation, artifactSha256(statePath)),
  );
  throw new Error(
    `Manual sample review is required. Review ${reviewRequestPath}, create an approval file outside ${outputRoot}, set LEXICON_PILOT_REVIEW_FILE, and rerun the protected pilot. The second pass revalidates these exact artifact bytes and does not call the provider.`,
  );
}

const resolvedReviewFile = resolve(reviewFile);
const reviewRelative = relative(outputRoot, resolvedReviewFile);
if (
  reviewRelative === "" ||
  (!reviewRelative.startsWith(`..${sep}`) && reviewRelative !== "..")
) {
  throw new Error(
    "LEXICON_PILOT_REVIEW_FILE must be outside the pilot output directory.",
  );
}
if (!existsSync(statePath)) {
  throw new Error(
    "Protected pilot state is missing. Run pnpm phase1:pilot once without LEXICON_PILOT_REVIEW_FILE before submitting approval.",
  );
}
const state = readJson(statePath);
const frozenStateSha256 = artifactSha256(statePath);
if (
  state.stateVersion !== "sylis.phase-1-pilot-state/1" ||
  state.commit !== commit ||
  !sameJson(state.sourceManifest, sourceManifest) ||
  !sameJson(state.buildConfiguration, buildConfiguration)
) {
  throw new Error(
    "Protected pilot state does not match the current commit, source manifest, model, budget, pricing, or concurrency.",
  );
}

for (const path of [noAiOutput, aiFirstOutput, aiSecondOutput]) {
  if (!existsSync(path)) {
    throw new Error(`Protected pilot artifact is missing: ${path}.`);
  }
}
if (
  state.noAi.artifactSha256 !== artifactSha256(noAiOutput) ||
  state.aiFirst.artifactSha256 !== artifactSha256(aiFirstOutput) ||
  state.aiCachedReplay.artifactSha256 !== artifactSha256(aiSecondOutput)
) {
  throw new Error(
    "Protected pilot artifact bytes changed after review was requested.",
  );
}

noAiValidation = {
  compileResult: state.noAi.compileResult,
  validation: validate(noAiOutput),
};
firstValidation = {
  compileResult: state.aiFirst.compileResult,
  validation: validate(aiFirstOutput),
};
secondValidation = {
  compileResult: state.aiCachedReplay.compileResult,
  validation: validate(aiSecondOutput),
};
if (
  !sameJson(noAiValidation.validation, state.noAi.validation) ||
  !sameJson(firstValidation.validation, state.aiFirst.validation) ||
  !sameJson(secondValidation.validation, state.aiCachedReplay.validation)
) {
  throw new Error(
    "Protected pilot validation evidence changed between generation and approval.",
  );
}
const { firstBytes, firstAiArtifactManifest } = assertPilotResults(
  noAiValidation,
  firstValidation,
  secondValidation,
);

const reviewRequest = reviewRequestFor(firstValidation, frozenStateSha256);
if (!sameJson(readJson(reviewRequestPath), reviewRequest)) {
  throw new Error("Protected pilot review request changed after generation.");
}
const review = readJson(resolvedReviewFile);
const expectedSampleIds = reviewRequest.sample
  .map((sample) => sample.headwordId)
  .sort();
const reviewedSampleIds = Array.isArray(review.reviewedHeadwordIds)
  ? [...new Set(review.reviewedHeadwordIds)].sort()
  : [];
if (
  review.reviewVersion !== "sylis.phase-1-pilot-review/1" ||
  review.commit !== commit ||
  review.pilotStateSha256 !== reviewRequest.pilotStateSha256 ||
  review.artifactContentHash !== reviewRequest.artifactContentHash ||
  review.approved !== true ||
  typeof review.reviewer !== "string" ||
  review.reviewer.trim().length === 0 ||
  !sameJson(reviewedSampleIds, expectedSampleIds)
) {
  throw new Error(
    "Manual pilot review is invalid, incomplete, or bound to another commit/artifact.",
  );
}

const evidence = {
  evidenceVersion: "sylis.phase-1-pilot-evidence/3",
  commit,
  sourceManifest,
  buildConfiguration: {
    build: firstAiArtifactManifest.build,
    inputs: firstAiArtifactManifest.inputs,
    ai: firstAiArtifactManifest.ai,
    budget: buildConfiguration.budget,
  },
  noAi: {
    compile: noAiValidation.compileResult,
    validation: noAiValidation.validation,
  },
  aiFirst: {
    compile: firstValidation.compileResult,
    validation: firstValidation.validation,
  },
  aiCachedReplay: {
    compile: secondValidation.compileResult,
    validation: secondValidation.validation,
  },
  manualReview: review,
  deterministicArtifactSha256: sha256(firstBytes),
  byteLength: firstBytes.length,
  completedAt: new Date().toISOString(),
};
writePrivateJson(evidencePath, evidence);
process.stdout.write(
  `\nProtected Phase 1 exact-200 pilot passed. Evidence: ${evidencePath}\n`,
);
