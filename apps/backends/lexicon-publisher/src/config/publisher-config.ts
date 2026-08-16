import { isAbsolute, relative } from "node:path";

export interface LexiconPublisherConfig {
  databaseUrl: string;
  adminApiUrl: string;
  serviceToken: string;
  instanceId: string;
  workRoot: string;
  stagingRetentionHours: number;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  port: number;
}

export function lexiconPublisherConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LexiconPublisherConfig {
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    adminApiUrl: required(env, "ADMIN_API_URL"),
    serviceToken: required(env, "SERVICE_GRANT_TOKEN"),
    instanceId: env.RAILWAY_REPLICA_ID ?? `lexicon-publisher-${process.pid}`,
    workRoot: workRoot(env),
    stagingRetentionHours: integer(
      env.LEXICON_STAGING_RETENTION_HOURS,
      168,
      1,
      24 * 365,
    ),
    pollIntervalMs: integer(env.JOB_POLL_INTERVAL_MS, 5_000, 100),
    heartbeatIntervalMs: integer(env.JOB_HEARTBEAT_INTERVAL_MS, 10_000, 100),
    port: integer(env.PORT, 3_900, 1, 65_535),
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

function workRoot(env: NodeJS.ProcessEnv): string {
  const value =
    env.LEXICON_PUBLISHER_WORK_ROOT ?? "/data/lexicon-publisher/work";
  if (!isAbsolute(value))
    throw new Error("LEXICON_PUBLISHER_WORK_ROOT_ABSOLUTE_REQUIRED");
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (mount) {
    const fromMount = relative(mount, value);
    if (
      fromMount === ".." ||
      fromMount.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    ) {
      throw new Error("LEXICON_PUBLISHER_WORK_ROOT_MUST_BE_MOUNTED");
    }
  }
  return value;
}
