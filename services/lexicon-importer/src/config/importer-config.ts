export interface ImporterConfig {
  databaseUrl: string;
  instanceId: string;
  workRoot: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  checkpointKey: Buffer;
  port: number;
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const integerInRange = (
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
};

const workRoot = (env: NodeJS.ProcessEnv): string => {
  const value = env.LEXICON_IMPORTER_WORK_ROOT ?? "/data/lexicon-importer/work";
  if (!isAbsolute(value)) {
    throw new Error("LEXICON_IMPORTER_WORK_ROOT must be an absolute path");
  }
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (mount) {
    const pathFromMount = relative(mount, value);
    if (
      pathFromMount === ".." ||
      pathFromMount.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    ) {
      throw new Error(
        "LEXICON_IMPORTER_WORK_ROOT must be inside RAILWAY_VOLUME_MOUNT_PATH",
      );
    }
  }
  return value;
};

export const importerConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): ImporterConfig => {
  const checkpointKey = Buffer.from(
    required(env, "JOB_CHECKPOINT_KEY_BASE64"),
    "base64",
  );
  if (checkpointKey.length !== 32) {
    throw new Error("JOB_CHECKPOINT_KEY_BASE64 must decode to 32 bytes");
  }
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    instanceId: env.RAILWAY_REPLICA_ID ?? `local-${process.pid}`,
    workRoot: workRoot(env),
    pollIntervalMs: integerInRange(env, "JOB_POLL_INTERVAL_MS", 5_000, 100),
    leaseDurationMs: integerInRange(
      env,
      "JOB_LEASE_DURATION_MS",
      60_000,
      3_000,
    ),
    checkpointKey,
    port: integerInRange(env, "PORT", 3003, 1, 65_535),
  };
};
import { isAbsolute, relative } from "node:path";
