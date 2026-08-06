import { isAbsolute, relative } from "node:path";

export interface CompilerRunnerConfig {
  databaseUrl: string;
  aiEnabled: boolean;
  instanceId: string;
  workRoot: string;
  artifactRoot: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  checkpointKey: Buffer;
  port: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integerInRange(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
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
    const pathFromMount = relative(mount, value);
    if (
      pathFromMount === ".." ||
      pathFromMount.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    ) {
      throw new Error(`${name} must be inside RAILWAY_VOLUME_MOUNT_PATH`);
    }
  }
  return value;
}

export function compilerRunnerConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CompilerRunnerConfig {
  const checkpointKey = Buffer.from(
    required(env, "JOB_CHECKPOINT_KEY_BASE64"),
    "base64",
  );
  if (checkpointKey.length !== 32) {
    throw new Error("JOB_CHECKPOINT_KEY_BASE64 must decode to 32 bytes");
  }
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
    aiEnabled: env.LEXICON_AI_ENABLED === "true",
    instanceId: env.RAILWAY_REPLICA_ID ?? `local-${process.pid}`,
    workRoot: runtimePath(
      env,
      "LEXICON_RUNNER_WORK_ROOT",
      "/data/lexicon-compiler/work",
    ),
    artifactRoot: runtimePath(
      env,
      "LEXICON_ARTIFACT_ROOT",
      "/data/lexicon-compiler/artifacts",
    ),
    pollIntervalMs: integerInRange(env, "JOB_POLL_INTERVAL_MS", 5_000, 100),
    leaseDurationMs: integerInRange(
      env,
      "JOB_LEASE_DURATION_MS",
      60_000,
      3_000,
    ),
    checkpointKey,
    port: integerInRange(env, "PORT", 3002, 1, 65_535),
  };
}
