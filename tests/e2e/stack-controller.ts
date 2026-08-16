import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { OperatorRole } from "@sylis/database";

import {
  E2eControlPath,
  E2eAutomationFailpoint,
  E2eClamAvMode,
  E2eImagePullPolicy,
  E2eControllableService,
  E2eLexiconSourceAdapter,
  E2eLexiconSourceKey,
  E2eServiceActor,
  E2eServiceControlAction,
  E2eStackStage,
  E2eSuiteKind,
  type E2eLexiconFixture,
  e2ePorts,
  e2eProjectName,
  e2eRunId,
} from "./runtime";

const execute = promisify(execFile);

const root = resolve(import.meta.dirname, "../..");
const composeFile = resolve(import.meta.dirname, "compose.e2e.yml");
const fakeClamAvComposeFile = resolve(
  import.meta.dirname,
  "compose.e2e.fake-clamav.yml",
);
const clamAvMode = process.env.CI
  ? E2eClamAvMode.REAL
  : process.env.E2E_REAL_CLAMAV === "true"
    ? E2eClamAvMode.REAL
    : E2eClamAvMode.FAKE;
const composeParallelLimit = boundedInteger(
  process.env.E2E_COMPOSE_PARALLEL_LIMIT,
  2,
  1,
  4,
);
const runId = e2eRunId();
const projectName = e2eProjectName(runId);
const ports = e2ePorts();
const runtimeDirectory = resolve(import.meta.dirname, ".runtime", runId);
const diagnosticsDirectory = resolve(import.meta.dirname, "diagnostics", runId);
const environmentFile = resolve(runtimeDirectory, "stack.env");
const endpointManifest = resolve(runtimeDirectory, "endpoints.json");
const lexiconFixtureDirectory = resolve(runtimeDirectory, "lexicon-fixture");
const lexiconFixtureContainerRoot = "/fixtures/lexicon";
const operatorPassword = `Sylis-E2E-${randomBytes(18).toString("base64url")}-Aa1!`;
const operatorTotpSecret = base32(randomBytes(20));
const operators = Array.from(
  { length: process.env.CI ? 1 : 4 },
  (_, workerIndex) => ({
    email: `operator+worker-${workerIndex}@sylis.test`,
    password: operatorPassword,
    totpSecret: operatorTotpSecret,
  }),
);
const operator = operators[0]!;
const deploymentIngestToken = randomBytes(32).toString("hex");
const roleOperators = Object.values(OperatorRole).map((role) => ({
  role,
  email: `operator+${role.toLocaleLowerCase("en-US")}@sylis.test`,
  password: operator.password,
  totpSecret: operator.totpSecret,
}));
let stage = E2eStackStage.STARTING;
let lastError: string | null = null;
let operation: Promise<void> = Promise.resolve();
let server: ReturnType<typeof createServer> | null = null;
let cleanupPromise: Promise<void> | null = null;
let lexiconFixture: E2eLexiconFixture | null = null;
const redactionSecrets = new Set<string>([
  operatorPassword,
  operatorTotpSecret,
]);

async function main(): Promise<void> {
  await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  lexiconFixture = await prepareLexiconFixture();
  await writeEnvironment();
  await compose(
    "up",
    "--detach",
    "--wait",
    "postgres",
    "redis",
    "minio",
    "clamav",
    "mailpit",
    "source-fixture",
  );
  await compose("run", "--rm", "minio-init");
  stage = E2eStackStage.INFRA_READY;
  server = createServer((request, response) => {
    void route(request.method, request.url, response);
  });
  await new Promise<void>((resolveListen, reject) => {
    server!.once("error", reject);
    server!.listen(ports.controller, "127.0.0.1", resolveListen);
  });
  process.once("SIGINT", () => void shutdown(0));
  process.once("SIGTERM", () => void shutdown(0));
}

async function route(
  method: string | undefined,
  path: string | undefined,
  response: ServerResponse,
): Promise<void> {
  if (method === "GET" && path === E2eControlPath.LIVE) {
    json(response, 200, state());
    return;
  }
  if (method === "GET" && path === E2eControlPath.READY) {
    json(response, stage === E2eStackStage.READY ? 200 : 503, state());
    return;
  }
  if (method !== "POST") {
    json(response, 404, { error: "E2E_CONTROL_ROUTE_NOT_FOUND" });
    return;
  }
  try {
    const serviceControl = controlledService(path);
    operation = operation
      .catch(() => undefined)
      .then(() =>
        serviceControl
          ? controlService(serviceControl.service, serviceControl.action)
          : transition(path),
      );
    await operation;
    json(response, 200, state());
  } catch (error) {
    stage = E2eStackStage.FAILED;
    lastError = error instanceof Error ? error.message : String(error);
    json(response, 500, state());
  }
}

async function controlService(
  service: E2eControllableService,
  action: E2eServiceControlAction,
): Promise<void> {
  if (stage !== E2eStackStage.READY) {
    throw new Error("E2E_SERVICE_CONTROL_STAGE_INVALID");
  }
  if (
    service === E2eControllableService.AUTOMATION_EXECUTOR &&
    action !== E2eServiceControlAction.RESTART
  ) {
    throw new Error("E2E_SERVICE_CONTROL_ACTION_NOT_ALLOWED");
  }
  switch (action) {
    case E2eServiceControlAction.STOP:
      await compose("stop", "--timeout", "10", service);
      return;
    case E2eServiceControlAction.START:
      await compose("up", "--detach", "--wait", service);
      return;
    case E2eServiceControlAction.RESTART:
      await compose("kill", "--signal", "SIGKILL", service);
      await compose("up", "--detach", "--wait", service);
  }
}

function controlledService(path: string | undefined): {
  service: E2eControllableService;
  action: E2eServiceControlAction;
} | null {
  const match = /^\/control\/services\/([^/]+)\/([^/]+)$/.exec(path ?? "");
  if (!match?.[1] || !match[2]) return null;
  const service = match[1];
  if (
    !Object.values(E2eControllableService).includes(
      service as E2eControllableService,
    )
  ) {
    throw new Error("E2E_SERVICE_CONTROL_SERVICE_NOT_ALLOWED");
  }
  const action = match[2];
  if (
    !Object.values(E2eServiceControlAction).includes(
      action as E2eServiceControlAction,
    )
  ) {
    throw new Error("E2E_SERVICE_CONTROL_ACTION_NOT_ALLOWED");
  }
  return {
    service: service as E2eControllableService,
    action: action as E2eServiceControlAction,
  };
}

async function transition(path: string | undefined): Promise<void> {
  if (path === E2eControlPath.CLEANUP) {
    await cleanupStack();
    return;
  }
  if (path === E2eControlPath.DATABASE_INSTALL) {
    if (
      stage === E2eStackStage.DATABASE_INSTALLED ||
      stage === E2eStackStage.SEEDED ||
      stage === E2eStackStage.READY
    )
      return;
    if (stage !== E2eStackStage.INFRA_READY)
      throw new Error("E2E_DATABASE_INSTALL_STAGE_INVALID");
    await compose("run", "--rm", "database-install");
    stage = E2eStackStage.DATABASE_INSTALLED;
    return;
  }
  if (path === E2eControlPath.SEED) {
    if (stage === E2eStackStage.SEEDED || stage === E2eStackStage.READY) return;
    if (stage !== E2eStackStage.DATABASE_INSTALLED)
      throw new Error("E2E_SEED_STAGE_INVALID");
    await compose("run", "--rm", "seed");
    stage = E2eStackStage.SEEDED;
    return;
  }
  if (path === E2eControlPath.START_APPS) {
    if (stage === E2eStackStage.READY) return;
    if (stage !== E2eStackStage.SEEDED)
      throw new Error("E2E_APP_STAGE_INVALID");
    await compose(
      "up",
      "--detach",
      "--wait",
      "web",
      "admin",
      "api",
      "admin-api",
      "agent-api",
      "model-gateway",
      "agent-executor",
      "agent-evaluator",
      "asset-processor",
      "automation-executor",
      "lexicon-builder",
      "lexicon-publisher",
    );
    await writeFile(
      endpointManifest,
      `${JSON.stringify({ endpoints: endpoints(), operator, operators, roleOperators, lexiconFixture, deploymentIngestToken }, null, 2)}\n`,
      { mode: 0o600 },
    );
    stage = E2eStackStage.READY;
    return;
  }
  throw new Error("E2E_CONTROL_COMMAND_NOT_FOUND");
}

async function compose(...args: string[]): Promise<void> {
  const startedAt = Date.now();
  const operationLabel = args.join(" ");
  process.stdout.write(
    `[e2e] compose ${operationLabel} started (parallel=${composeParallelLimit})\n`,
  );
  try {
    const result = await executeCompose(args);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  } finally {
    process.stdout.write(
      `[e2e] compose ${operationLabel} finished (${Math.ceil((Date.now() - startedAt) / 1_000)}s)\n`,
    );
  }
}

async function executeCompose(
  args: readonly string[],
): Promise<{ stdout: string; stderr: string }> {
  return execute(
    "docker",
    [
      "compose",
      "--project-name",
      projectName,
      "--env-file",
      environmentFile,
      "--file",
      composeFile,
      ...(clamAvMode === E2eClamAvMode.FAKE
        ? ["--file", fakeClamAvComposeFile]
        : []),
      ...args,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        COMPOSE_PARALLEL_LIMIT: String(composeParallelLimit),
      },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

async function writeEnvironment(): Promise<void> {
  const token = () => randomBytes(32).toString("hex");
  const key = () => randomBytes(32).toString("base64");
  const delayedDataExports =
    process.env.E2E_SUITE_KIND === E2eSuiteKind.CORE ||
    process.env.E2E_SUITE_KIND === E2eSuiteKind.SYSTEM;
  const serviceTokens = {
    [E2eServiceActor.API]: token(),
    [E2eServiceActor.ADMIN_API]: token(),
    [E2eServiceActor.AGENT_API]: token(),
    [E2eServiceActor.AGENT_EXECUTOR]: token(),
    [E2eServiceActor.AGENT_EVALUATOR]: token(),
    [E2eServiceActor.ASSET_PROCESSOR]: token(),
    [E2eServiceActor.AUTOMATION_EXECUTOR]: token(),
    [E2eServiceActor.LEXICON_BUILDER]: token(),
    [E2eServiceActor.LEXICON_PUBLISHER]: token(),
  } satisfies Record<E2eServiceActor, string>;
  const credentialKey = key();
  const values: Record<string, string | number> = {
    E2E_RUN_ID: runId,
    E2E_WEB_PORT: ports.web,
    E2E_ADMIN_PORT: ports.admin,
    E2E_API_PORT: ports.api,
    E2E_ADMIN_API_PORT: ports.adminApi,
    E2E_AGENT_API_PORT: ports.agentApi,
    E2E_MODEL_GATEWAY_PORT: ports.modelGateway,
    E2E_MAILPIT_PORT: ports.mailpit,
    E2E_MINIO_PORT: ports.minio,
    E2E_POSTGRES_PASSWORD: token(),
    E2E_MINIO_ACCESS_KEY: randomBytes(10).toString("hex"),
    E2E_MINIO_SECRET_KEY: token(),
    E2E_SESSION_HASH_KEY: token(),
    E2E_CSRF_SIGNING_KEY: token(),
    E2E_REGISTRATION_SIGNING_KEY: token(),
    E2E_USER_CONTENT_RETENTION_MS: 1_000,
    E2E_CONTENT_KEY_BASE64: key(),
    E2E_JOB_CHECKPOINT_KEY_BASE64: key(),
    E2E_DEPLOYMENT_INGEST_TOKEN: deploymentIngestToken,
    E2E_CREDENTIAL_KEK_BASE64: credentialKey,
    E2E_CREDENTIAL_FINGERPRINT_KEY_BASE64: key(),
    E2E_MODEL_CONTENT_KEK_BASE64: key(),
    E2E_ADMIN_EMAIL: operator.email,
    E2E_ADMIN_PASSWORD: operator.password,
    E2E_ADMIN_TOTP_SECRET: operator.totpSecret,
    E2E_OPERATORS_JSON: JSON.stringify(operators),
    E2E_ROLE_OPERATORS_JSON: JSON.stringify(roleOperators),
    E2E_ADMIN_API_TOKEN: serviceTokens[E2eServiceActor.ADMIN_API],
    E2E_API_TOKEN: serviceTokens[E2eServiceActor.API],
    E2E_AGENT_API_TOKEN: serviceTokens[E2eServiceActor.AGENT_API],
    E2E_AGENT_EXECUTOR_TOKEN: serviceTokens[E2eServiceActor.AGENT_EXECUTOR],
    E2E_BRAVE_SEARCH_API_KEY: token(),
    E2E_AGENT_EVALUATOR_TOKEN: serviceTokens[E2eServiceActor.AGENT_EVALUATOR],
    E2E_ASSET_PROCESSOR_TOKEN: serviceTokens[E2eServiceActor.ASSET_PROCESSOR],
    E2E_AUTOMATION_EXECUTOR_TOKEN:
      serviceTokens[E2eServiceActor.AUTOMATION_EXECUTOR],
    E2E_AUTOMATION_FAILPOINT: delayedDataExports
      ? E2eAutomationFailpoint.DATA_EXPORT_AFTER_COLLECTING
      : E2eAutomationFailpoint.NONE,
    E2E_AUTOMATION_FAILPOINT_DELAY_MS: delayedDataExports ? 6_000 : 1,
    E2E_CLAMAV_MODE: clamAvMode,
    E2E_LEXICON_BUILDER_TOKEN: serviceTokens[E2eServiceActor.LEXICON_BUILDER],
    E2E_LEXICON_PUBLISHER_TOKEN:
      serviceTokens[E2eServiceActor.LEXICON_PUBLISHER],
    E2E_LEXICON_FIXTURE_ROOT: lexiconFixtureDirectory,
    E2E_API_SERVICE_TOKENS: JSON.stringify({
      [E2eServiceActor.ADMIN_API]: serviceTokens[E2eServiceActor.ADMIN_API],
      [E2eServiceActor.AGENT_API]: serviceTokens[E2eServiceActor.AGENT_API],
      [E2eServiceActor.AGENT_EXECUTOR]:
        serviceTokens[E2eServiceActor.AGENT_EXECUTOR],
      [E2eServiceActor.ASSET_PROCESSOR]:
        serviceTokens[E2eServiceActor.ASSET_PROCESSOR],
      [E2eServiceActor.AUTOMATION_EXECUTOR]:
        serviceTokens[E2eServiceActor.AUTOMATION_EXECUTOR],
    }),
    E2E_ADMIN_SERVICE_TOKENS: JSON.stringify({
      [E2eServiceActor.AGENT_EXECUTOR]:
        serviceTokens[E2eServiceActor.AGENT_EXECUTOR],
      [E2eServiceActor.AGENT_EVALUATOR]:
        serviceTokens[E2eServiceActor.AGENT_EVALUATOR],
      [E2eServiceActor.ASSET_PROCESSOR]:
        serviceTokens[E2eServiceActor.ASSET_PROCESSOR],
      [E2eServiceActor.AUTOMATION_EXECUTOR]:
        serviceTokens[E2eServiceActor.AUTOMATION_EXECUTOR],
      [E2eServiceActor.LEXICON_BUILDER]:
        serviceTokens[E2eServiceActor.LEXICON_BUILDER],
      [E2eServiceActor.LEXICON_PUBLISHER]:
        serviceTokens[E2eServiceActor.LEXICON_PUBLISHER],
    }),
    E2E_AGENT_SERVICE_TOKENS: JSON.stringify({
      [E2eServiceActor.API]: serviceTokens[E2eServiceActor.API],
      [E2eServiceActor.ADMIN_API]: serviceTokens[E2eServiceActor.ADMIN_API],
      [E2eServiceActor.AGENT_EXECUTOR]:
        serviceTokens[E2eServiceActor.AGENT_EXECUTOR],
      [E2eServiceActor.AGENT_EVALUATOR]:
        serviceTokens[E2eServiceActor.AGENT_EVALUATOR],
      [E2eServiceActor.ASSET_PROCESSOR]:
        serviceTokens[E2eServiceActor.ASSET_PROCESSOR],
      [E2eServiceActor.AUTOMATION_EXECUTOR]:
        serviceTokens[E2eServiceActor.AUTOMATION_EXECUTOR],
    }),
    E2E_GATEWAY_SERVICE_TOKENS: JSON.stringify({
      [E2eServiceActor.API]: serviceTokens[E2eServiceActor.API],
      [E2eServiceActor.ADMIN_API]: serviceTokens[E2eServiceActor.ADMIN_API],
      [E2eServiceActor.AGENT_API]: serviceTokens[E2eServiceActor.AGENT_API],
      [E2eServiceActor.AGENT_EXECUTOR]:
        serviceTokens[E2eServiceActor.AGENT_EXECUTOR],
      [E2eServiceActor.AGENT_EVALUATOR]:
        serviceTokens[E2eServiceActor.AGENT_EVALUATOR],
      [E2eServiceActor.ASSET_PROCESSOR]:
        serviceTokens[E2eServiceActor.ASSET_PROCESSOR],
      [E2eServiceActor.AUTOMATION_EXECUTOR]:
        serviceTokens[E2eServiceActor.AUTOMATION_EXECUTOR],
      [E2eServiceActor.LEXICON_BUILDER]:
        serviceTokens[E2eServiceActor.LEXICON_BUILDER],
    }),
    SYLIS_E2E_IMAGE_PREFIX: process.env.SYLIS_E2E_IMAGE_PREFIX ?? "sylis-e2e",
    SYLIS_E2E_IMAGE_TAG: process.env.SYLIS_E2E_IMAGE_TAG ?? "local",
    SYLIS_E2E_PULL_POLICY:
      process.env.SYLIS_E2E_PULL_POLICY ??
      (process.env.CI ? E2eImagePullPolicy.NEVER : E2eImagePullPolicy.BUILD),
  };
  const body = Object.entries(values)
    .map(([name, value]) => `${name}=${String(value).replace(/\n/g, "")}`)
    .join("\n");
  for (const [name, value] of Object.entries(values)) {
    if (isSensitiveEnvironmentName(name)) {
      redactionSecrets.add(String(value));
    }
  }
  await writeFile(environmentFile, `${body}\n`, { mode: 0o600 });
}

async function prepareLexiconFixture(): Promise<E2eLexiconFixture> {
  await mkdir(lexiconFixtureDirectory, { recursive: true, mode: 0o755 });
  await chmod(lexiconFixtureDirectory, 0o755);
  const compilerRoot = resolve(root, "packages/lexicon-compiler");
  const pilotHeadwords = JSON.parse(
    await readFile(
      resolve(compilerRoot, "data/pilot-headwords-v1.json"),
      "utf8",
    ),
  ) as {
    headwordSetVersion?: unknown;
    headwords?: Array<{ languageTag?: unknown; normalizedHeadword?: unknown }>;
  };
  const headwords = pilotHeadwords.headwords;
  if (
    pilotHeadwords.headwordSetVersion !== "sylis.headword-set/1" ||
    !Array.isArray(headwords) ||
    headwords.length !== 200 ||
    headwords.some(
      (entry) =>
        entry.languageTag !== "en" ||
        typeof entry.normalizedHeadword !== "string" ||
        entry.normalizedHeadword.length === 0,
    ) ||
    new Set(headwords.map((entry) => entry.normalizedHeadword)).size !== 200
  ) {
    throw new Error("E2E_LEXICON_HEADWORD_SET_INVALID");
  }

  const headwordSetPath = resolve(lexiconFixtureDirectory, "headwords.json");
  await writeJson(headwordSetPath, {
    headwordSetVersion: "sylis.headword-set/1",
    version: "e2e-pilot-200-v1",
    headwords,
  });
  const ecdictPath = resolve(lexiconFixtureDirectory, "ecdict.csv");
  const ecdictRows = [
    ["word", "phonetic", "definition", "translation", "pos", "tag", "exchange"],
    ...headwords.map(({ normalizedHeadword }) => [
      normalizedHeadword as string,
      "",
      `n. deterministic E2E definition for ${normalizedHeadword as string}`,
      `n. deterministic E2E meaning for ${normalizedHeadword as string}`,
      "n",
      "e2e",
      "",
    ]),
  ];
  await writeFile(
    ecdictPath,
    `${ecdictRows.map((row) => row.map(csvField).join(",")).join("\n")}\n`,
    { mode: 0o644 },
  );
  await chmod(ecdictPath, 0o644);

  const fixtureRoot = resolve(compilerRoot, "test/fixtures");
  const copiedSources = ["kaikki.jsonl", "oewn.xml", "youdao.ndjson"] as const;
  await Promise.all(
    copiedSources.map(async (name) => {
      const destination = resolve(lexiconFixtureDirectory, name);
      await copyFile(resolve(fixtureRoot, name), destination);
      await chmod(destination, 0o644);
    }),
  );
  const richTargetsPath = resolve(lexiconFixtureDirectory, "rich-targets.json");
  await writeJson(richTargetsPath, {
    targetSetVersion: "sylis.rich-target-set/1",
    version: "e2e-pilot-rich-v1",
    targets: [
      {
        key: "helpful-primary",
        languageTag: "en",
        headword: "helpful",
        partOfSpeech: "lexinfo:noun",
        senseDefinitionContains: "deterministic E2E definition for helpful",
        materialKinds: ["MNEMONIC", "MICRO_STORY"],
        generateStudyHint: true,
        generateExercise: true,
      },
    ],
  });

  const sourceFiles = {
    [E2eLexiconSourceKey.ECDICT]: {
      filename: "ecdict.csv",
      adapter: E2eLexiconSourceAdapter.ECDICT,
    },
    [E2eLexiconSourceKey.KAIKKI]: {
      filename: "kaikki.jsonl",
      adapter: E2eLexiconSourceAdapter.WIKTEXTRACT_EN,
    },
    [E2eLexiconSourceKey.OEWN]: {
      filename: "oewn.xml",
      adapter: E2eLexiconSourceAdapter.WN_LMF,
    },
    [E2eLexiconSourceKey.YOUDAO]: {
      filename: "youdao.ndjson",
      adapter: E2eLexiconSourceAdapter.YOUDAO_NDJSON,
    },
  } as const;
  const sources = await Promise.all(
    Object.entries(sourceFiles).map(async ([key, source]) => ({
      key,
      version: "e2e-fixture-v1",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      uri: `${lexiconFixtureContainerRoot}/${source.filename}`,
      sha256: await fileHash(resolve(lexiconFixtureDirectory, source.filename)),
      adapter: source.adapter,
      homepageUri: `https://sources.sylis.test/${key}`,
      rights: {
        mayBuild: true,
        mayServe: true,
        mayExport: true,
        requiresAttribution: false,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
      },
    })),
  );
  const manifestPath = resolve(lexiconFixtureDirectory, "manifest.json");
  await writeJson(manifestPath, {
    manifestVersion: "sylis.source-manifest/1",
    release: {
      lexiconKey: "sylis-en-zh-e2e-pipeline",
      releaseVersion: "e2e-pilot-200-v1",
      sourceLanguageTag: "en",
      learningLanguageTags: ["zh-CN"],
      compilerVersion: "0.0.1",
      gitCommit: "0".repeat(40),
    },
    selection: {
      headwordSet: {
        version: "e2e-pilot-200-v1",
        path: `${lexiconFixtureContainerRoot}/headwords.json`,
        sha256: await fileHash(headwordSetPath),
      },
    },
    pedagogy: {
      audienceProfileKey: "zh-general-adult-en-v1",
      learningLanguageTag: "en",
      supportLanguageTag: "zh-CN",
      richTargetSet: {
        version: "e2e-pilot-rich-v1",
        path: `${lexiconFixtureContainerRoot}/rich-targets.json`,
        sha256: await fileHash(richTargetsPath),
      },
    },
    sources,
  });
  return {
    manifestUri: `file://${lexiconFixtureContainerRoot}/manifest.json`,
    manifestHash: `sha256:${await fileHash(manifestPath)}`,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  await chmod(path, 0o644);
}

async function fileHash(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function isSensitiveEnvironmentName(name: string): boolean {
  return /(?:PASSWORD|TOKEN|KEY|SECRET|CREDENTIAL)/.test(name);
}

function base32(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let value = "";
  for (let index = 0; index < bits.length; index += 5) {
    value +=
      alphabet[
        Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)
      ]!;
  }
  return value;
}

function endpoints() {
  return {
    web: `http://127.0.0.1:${ports.web}`,
    admin: `http://127.0.0.1:${ports.admin}`,
    api: `http://127.0.0.1:${ports.api}`,
    adminApi: `http://127.0.0.1:${ports.adminApi}`,
    agentApi: `http://127.0.0.1:${ports.agentApi}`,
    modelGateway: `http://127.0.0.1:${ports.modelGateway}`,
    mailpit: `http://127.0.0.1:${ports.mailpit}`,
    minio: `http://127.0.0.1:${ports.minio}`,
  } as const;
}

function state() {
  return { projectName, runId, stage, lastError, endpoints: endpoints() };
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(value));
}

async function shutdown(exitCode: number): Promise<void> {
  server?.close();
  if (stage !== E2eStackStage.STOPPED) {
    try {
      await cleanupStack();
    } catch (error) {
      lastError ??= error instanceof Error ? error.message : String(error);
      exitCode = 1;
    }
  }
  await rm(runtimeDirectory, { recursive: true, force: true });
  process.exit(exitCode);
}

async function cleanupStack(): Promise<void> {
  if (stage === E2eStackStage.STOPPED) return;
  cleanupPromise ??= performCleanup();
  await cleanupPromise;
}

async function performCleanup(): Promise<void> {
  stage = E2eStackStage.STOPPING;
  const errors: unknown[] = [];
  try {
    await captureDiagnostics();
  } catch (error) {
    errors.push(error);
  }
  try {
    await compose("down", "--volumes", "--remove-orphans", "--timeout", "30");
  } catch (error) {
    errors.push(error);
  }
  await rm(runtimeDirectory, { recursive: true, force: true });
  if (errors.length > 0) {
    stage = E2eStackStage.FAILED;
    throw new AggregateError(errors, "E2E_STACK_CLEANUP_FAILED");
  }
  stage = E2eStackStage.STOPPED;
}

async function captureDiagnostics(): Promise<void> {
  await mkdir(diagnosticsDirectory, { recursive: true });
  const [services, logs] = await Promise.all([
    diagnosticComposeOutput("ps", "--all"),
    diagnosticComposeOutput("logs", "--no-color", "--timestamps"),
  ]);
  await Promise.all([
    writeFile(resolve(diagnosticsDirectory, "compose-ps.txt"), services),
    writeFile(resolve(diagnosticsDirectory, "compose-logs.txt"), logs),
    writeFile(
      resolve(diagnosticsDirectory, "controller-state.json"),
      redact(`${JSON.stringify(state(), null, 2)}\n`),
    ),
  ]);
}

async function diagnosticComposeOutput(...args: string[]): Promise<string> {
  try {
    const result = await executeCompose(args);
    return redact(`${result.stdout}${result.stderr}`);
  } catch (error) {
    const output = diagnosticErrorOutput(error);
    return redact(`${output}\n`);
  }
}

function diagnosticErrorOutput(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const value = error as {
    message?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  };
  return [value.message, value.stdout, value.stderr]
    .filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    )
    .join("\n");
}

function redact(value: string): string {
  let redacted = value;
  for (const secret of [...redactionSecrets].sort(
    (left, right) => right.length - left.length,
  )) {
    if (secret.length < 6) continue;
    redacted = redacted.replaceAll(secret, "[REDACTED]");
    redacted = redacted.replaceAll(encodeURIComponent(secret), "[REDACTED]");
  }
  return redacted;
}

void main().catch(async (error) => {
  stage = E2eStackStage.FAILED;
  lastError = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${lastError}\n`);
  await shutdown(1);
});
