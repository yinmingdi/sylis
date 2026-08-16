import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { OperatorRole } from "@sylis/database";
import { CiLane, TestTag } from "@sylis/test-support";

export enum E2eProjectKind {
  DATABASE_INSTALL = "setup:database-install",
  SEED = "setup:seed",
  WEB_DESKTOP = "web:desktop",
  WEB_MOBILE = "web:mobile",
  WEB_ACCESSIBILITY = "web:accessibility",
  ADMIN_DESKTOP = "admin:desktop",
  ADMIN_ACCESSIBILITY = "admin:accessibility",
  AGENT_DESKTOP = "agent:desktop",
  API_SYSTEM = "api:system",
  FIREFOX_SMOKE = "browser:firefox:smoke",
  FIREFOX_NIGHTLY = "browser:firefox:nightly",
  WEBKIT_SMOKE = "browser:webkit:smoke",
  WEBKIT_NIGHTLY = "browser:webkit:nightly",
  SYSTEM_EXCLUSIVE = "system:exclusive",
  TEARDOWN = "stack:teardown",
}

export enum E2eSuiteKind {
  CORE = "core",
  API = "api",
  SYSTEM = "system",
  BROWSER_QUALITY = "browser-quality",
}

export enum E2eRunKind {
  CORE = "core",
  API = "api",
  SYSTEM = "system",
  BROWSER_QUALITY = "browser-quality",
  FULL = "full",
}

export enum E2eImagePullPolicy {
  BUILD = "build",
  NEVER = "never",
}

export enum E2eClamAvMode {
  REAL = "real",
  FAKE = "fake",
}

export enum E2eAutomationFailpoint {
  DATA_EXPORT_AFTER_COLLECTING = "DATA_EXPORT_AFTER_COLLECTING",
  NONE = "NONE",
}

export enum E2eModelProviderKey {
  FAKE = "fake",
}

export enum E2eLexiconSourceKey {
  ECDICT = "ecdict",
  KAIKKI = "kaikki",
  OEWN = "oewn",
  YOUDAO = "youdao",
}

export enum E2eLexiconSourceAdapter {
  ECDICT = "ECDICT",
  WIKTEXTRACT_EN = "WIKTEXTRACT_EN",
  WN_LMF = "WN_LMF",
  YOUDAO_NDJSON = "YOUDAO_NDJSON",
}

export enum E2eFixtureTime {
  BASELINE = "2026-01-01T00:00:00.000Z",
}

export enum E2eApiAudience {
  USER = "USER",
  ADMIN = "ADMIN",
  AGENT = "AGENT",
}

export enum E2eApiAuthenticationMode {
  PUBLIC = "PUBLIC",
  USER_SESSION = "USER_SESSION",
  ADMIN_SESSION = "ADMIN_SESSION",
  SERVICE_GRANT = "SERVICE_GRANT",
}

export enum E2eControlPath {
  LIVE = "/live",
  READY = "/ready",
  DATABASE_INSTALL = "/control/database-install",
  SEED = "/control/seed",
  START_APPS = "/control/apps",
  CLEANUP = "/control/cleanup",
}

export enum E2eStackStage {
  STARTING = "STARTING",
  INFRA_READY = "INFRA_READY",
  DATABASE_INSTALLED = "DATABASE_INSTALLED",
  SEEDED = "SEEDED",
  READY = "READY",
  STOPPING = "STOPPING",
  STOPPED = "STOPPED",
  FAILED = "FAILED",
}

export enum E2eControllableService {
  AGENT_EXECUTOR = "agent-executor",
  AUTOMATION_EXECUTOR = "automation-executor",
  CLAMAV = "clamav",
  MINIO = "minio",
  POSTGRES = "postgres",
  REDIS = "redis",
}

export enum E2eServiceActor {
  API = "api",
  ADMIN_API = "admin-api",
  AGENT_API = "agent-api",
  AGENT_EXECUTOR = "agent-executor",
  AGENT_EVALUATOR = "agent-evaluator",
  ASSET_PROCESSOR = "asset-processor",
  AUTOMATION_EXECUTOR = "automation-executor",
  LEXICON_BUILDER = "lexicon-builder",
  LEXICON_PUBLISHER = "lexicon-publisher",
}

export enum E2eServiceControlAction {
  RESTART = "restart",
  START = "start",
  STOP = "stop",
}

export interface E2ePorts {
  web: number;
  admin: number;
  api: number;
  adminApi: number;
  agentApi: number;
  modelGateway: number;
  mailpit: number;
  minio: number;
  controller: number;
}

export interface E2eOperatorCredentials {
  email: string;
  password: string;
  totpSecret: string;
}

export interface E2eRoleOperatorCredentials extends E2eOperatorCredentials {
  role: OperatorRole;
}

export interface E2eLexiconFixture {
  manifestUri: string;
  manifestHash: string;
}

export { TestTag };

export function e2eTags(...tags: readonly TestTag[]): string[] {
  return tags.map((tag) => `@${tag}`);
}

export function e2eProjectsForSuite(
  suite: E2eSuiteKind,
): readonly E2eProjectKind[] {
  switch (suite) {
    case E2eSuiteKind.CORE:
      return [
        E2eProjectKind.WEB_DESKTOP,
        E2eProjectKind.ADMIN_DESKTOP,
        E2eProjectKind.AGENT_DESKTOP,
      ];
    case E2eSuiteKind.API:
      return [E2eProjectKind.API_SYSTEM];
    case E2eSuiteKind.SYSTEM:
      return [E2eProjectKind.SYSTEM_EXCLUSIVE];
    case E2eSuiteKind.BROWSER_QUALITY:
      return [
        E2eProjectKind.WEB_MOBILE,
        E2eProjectKind.WEB_ACCESSIBILITY,
        E2eProjectKind.ADMIN_ACCESSIBILITY,
        E2eProjectKind.FIREFOX_SMOKE,
        E2eProjectKind.WEBKIT_SMOKE,
      ];
  }
}

export function e2eSuitesForRun(run: E2eRunKind): readonly E2eSuiteKind[] {
  switch (run) {
    case E2eRunKind.CORE:
      return [E2eSuiteKind.CORE];
    case E2eRunKind.API:
      return [E2eSuiteKind.API];
    case E2eRunKind.SYSTEM:
      return [E2eSuiteKind.API, E2eSuiteKind.SYSTEM];
    case E2eRunKind.BROWSER_QUALITY:
      return [E2eSuiteKind.BROWSER_QUALITY];
    case E2eRunKind.FULL:
      return [
        E2eSuiteKind.CORE,
        E2eSuiteKind.API,
        E2eSuiteKind.SYSTEM,
        E2eSuiteKind.BROWSER_QUALITY,
      ];
  }
}

export function e2eProjectsForCiLane(lane: CiLane): readonly E2eProjectKind[] {
  switch (lane) {
    case CiLane.PULL_REQUEST:
    case CiLane.MAIN:
      return [
        E2eProjectKind.WEB_DESKTOP,
        E2eProjectKind.WEB_MOBILE,
        E2eProjectKind.WEB_ACCESSIBILITY,
        E2eProjectKind.ADMIN_DESKTOP,
        E2eProjectKind.ADMIN_ACCESSIBILITY,
        E2eProjectKind.AGENT_DESKTOP,
        E2eProjectKind.API_SYSTEM,
        E2eProjectKind.FIREFOX_SMOKE,
        E2eProjectKind.WEBKIT_SMOKE,
        E2eProjectKind.SYSTEM_EXCLUSIVE,
      ];
    case CiLane.NIGHTLY:
      return [
        E2eProjectKind.WEB_DESKTOP,
        E2eProjectKind.WEB_MOBILE,
        E2eProjectKind.WEB_ACCESSIBILITY,
        E2eProjectKind.ADMIN_DESKTOP,
        E2eProjectKind.ADMIN_ACCESSIBILITY,
        E2eProjectKind.AGENT_DESKTOP,
        E2eProjectKind.API_SYSTEM,
        E2eProjectKind.FIREFOX_NIGHTLY,
        E2eProjectKind.WEBKIT_NIGHTLY,
        E2eProjectKind.SYSTEM_EXCLUSIVE,
      ];
    case CiLane.STAGING:
    case CiLane.PRODUCTION:
      return [E2eProjectKind.SYSTEM_EXCLUSIVE];
    case CiLane.MANUAL:
      return Object.values(E2eProjectKind).filter(
        (project) =>
          project !== E2eProjectKind.DATABASE_INSTALL &&
          project !== E2eProjectKind.SEED &&
          project !== E2eProjectKind.TEARDOWN,
      );
  }
}

export function e2eOperatorCredentials(
  workerIndex = 0,
): E2eOperatorCredentials {
  const path = resolve(
    import.meta.dirname,
    ".runtime",
    e2eRunId(),
    "endpoints.json",
  );
  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    operator?: Partial<E2eOperatorCredentials>;
    operators?: Array<Partial<E2eOperatorCredentials>>;
  };
  const operator = manifest.operators?.[workerIndex] ?? manifest.operator;
  if (!operator?.email || !operator.password || !operator.totpSecret) {
    throw new Error(`E2E_OPERATOR_CREDENTIALS_UNAVAILABLE:${workerIndex}`);
  }
  return {
    email: operator.email,
    password: operator.password,
    totpSecret: operator.totpSecret,
  };
}

export function e2eRoleOperatorCredentials(
  role: OperatorRole,
): E2eRoleOperatorCredentials {
  const path = resolve(
    import.meta.dirname,
    ".runtime",
    e2eRunId(),
    "endpoints.json",
  );
  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    roleOperators?: Array<Partial<E2eRoleOperatorCredentials>>;
  };
  const operator = manifest.roleOperators?.find(
    (candidate) => candidate.role === role,
  );
  if (!operator?.email || !operator.password || !operator.totpSecret) {
    throw new Error(`E2E_ROLE_OPERATOR_CREDENTIALS_UNAVAILABLE:${role}`);
  }
  return {
    role,
    email: operator.email,
    password: operator.password,
    totpSecret: operator.totpSecret,
  };
}

export function e2eLexiconFixture(): E2eLexiconFixture {
  const path = resolve(
    import.meta.dirname,
    ".runtime",
    e2eRunId(),
    "endpoints.json",
  );
  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    lexiconFixture?: Partial<E2eLexiconFixture>;
  };
  const fixture = manifest.lexiconFixture;
  if (
    !fixture?.manifestUri ||
    !fixture.manifestHash?.match(/^sha256:[a-f0-9]{64}$/)
  ) {
    throw new Error("E2E_LEXICON_FIXTURE_UNAVAILABLE");
  }
  return {
    manifestUri: fixture.manifestUri,
    manifestHash: fixture.manifestHash,
  };
}

export function e2eDeploymentIngestToken(): string {
  const path = resolve(
    import.meta.dirname,
    ".runtime",
    e2eRunId(),
    "endpoints.json",
  );
  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    deploymentIngestToken?: unknown;
  };
  if (
    typeof manifest.deploymentIngestToken !== "string" ||
    manifest.deploymentIngestToken.length < 32
  ) {
    throw new Error("E2E_DEPLOYMENT_INGEST_TOKEN_UNAVAILABLE");
  }
  return manifest.deploymentIngestToken;
}

export function e2eRunId(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.E2E_RUN_ID?.trim();
  if (explicit) return safeIdentifier(explicit);
  const source = `${env.GITHUB_RUN_ID ?? "local"}-${env.GITHUB_RUN_ATTEMPT ?? "1"}-${env.E2E_SHARD_INDEX ?? "1"}`;
  return safeIdentifier(source);
}

export function e2ePorts(env: NodeJS.ProcessEnv = process.env): E2ePorts {
  const shard = positiveInteger(env.E2E_SHARD_INDEX, 1);
  const explicit = env.E2E_BASE_PORT ? Number(env.E2E_BASE_PORT) : null;
  const shardBase = explicit ?? 17_000 + (shard - 1) * 1_000;
  const suiteOffset = e2eSuitePortOffset(env.E2E_SUITE_KIND);
  const base = shardBase + suiteOffset;
  if (!Number.isSafeInteger(base) || base < 1_024 || base > 64_000) {
    throw new Error("E2E_BASE_PORT_INVALID");
  }
  return {
    web: base,
    admin: base + 1,
    api: base + 2,
    adminApi: base + 3,
    agentApi: base + 4,
    modelGateway: base + 5,
    mailpit: base + 20,
    minio: base + 21,
    controller: base + 99,
  };
}

export function e2eProjectName(runId = e2eRunId()): string {
  const digest = createHash("sha256").update(runId).digest("hex").slice(0, 12);
  return `sylis-e2e-${digest}`;
}

export function controlUrl(path: E2eControlPath): string {
  return `http://127.0.0.1:${e2ePorts().controller}${path}`;
}

export function serviceControlUrl(
  service: E2eControllableService,
  action: E2eServiceControlAction,
): string {
  return `http://127.0.0.1:${e2ePorts().controller}/control/services/${service}/${action}`;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("E2E_POSITIVE_INTEGER_REQUIRED");
  }
  return parsed;
}

function e2eSuitePortOffset(value: string | undefined): number {
  switch (value) {
    case undefined:
    case E2eSuiteKind.CORE:
      return 0;
    case E2eSuiteKind.API:
      return 200;
    case E2eSuiteKind.SYSTEM:
      return 400;
    case E2eSuiteKind.BROWSER_QUALITY:
      return 600;
    default:
      throw new Error("E2E_SUITE_KIND_INVALID");
  }
}

function safeIdentifier(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
  if (!normalized || normalized.length > 80)
    throw new Error("E2E_RUN_ID_INVALID");
  return normalized;
}
