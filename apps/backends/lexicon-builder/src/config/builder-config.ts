import { isAbsolute, relative } from "node:path";

export interface LexiconBuilderConfig {
  databaseUrl: string;
  adminApiUrl: string;
  modelGatewayUrl: string | null;
  serviceToken: string;
  instanceId: string;
  workRoot: string;
  artifactRoot: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  port: number;
  aiEnabled: boolean;
}

export function lexiconBuilderConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LexiconBuilderConfig {
  if (
    env.NODE_ENV === "production" &&
    env.LEXICON_ARTIFACT_ALLOW_FILE === "true"
  ) {
    throw new Error(
      "LEXICON_ARTIFACT_ALLOW_FILE cannot be enabled in production",
    );
  }
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    adminApiUrl: required(env, "ADMIN_API_URL"),
    modelGatewayUrl: env.MODEL_GATEWAY_URL?.trim() || null,
    serviceToken: required(env, "SERVICE_GRANT_TOKEN"),
    instanceId: env.RAILWAY_REPLICA_ID ?? `lexicon-builder-${process.pid}`,
    workRoot: runtimePath(
      env,
      "LEXICON_BUILDER_WORK_ROOT",
      "/data/lexicon-builder/work",
    ),
    artifactRoot: runtimePath(
      env,
      "LEXICON_ARTIFACT_ROOT",
      "/data/lexicon-builder/artifacts",
    ),
    pollIntervalMs: integer(env.JOB_POLL_INTERVAL_MS, 5_000, 100),
    heartbeatIntervalMs: integer(env.JOB_HEARTBEAT_INTERVAL_MS, 10_000, 100),
    port: integer(env.PORT, 3_800, 1, 65_535),
    aiEnabled: env.LEXICON_AI_ENABLED === "true",
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("CONFIG_INTEGER_INVALID");
  }
  return parsed;
}

function runtimePath(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const value = env[name] ?? fallback;
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (mount) {
    const fromMount = relative(mount, value);
    if (
      fromMount === ".." ||
      fromMount.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    ) {
      throw new Error(`${name} must be inside RAILWAY_VOLUME_MOUNT_PATH`);
    }
  }
  return value;
}
