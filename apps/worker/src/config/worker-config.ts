import { Injectable } from "@nestjs/common";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

@Injectable()
export class WorkerConfig {
  readonly databaseUrl = required("DATABASE_URL");
  readonly instanceId =
    process.env.RAILWAY_REPLICA_ID ?? `local-${process.pid}`;
  readonly port = Number(process.env.PORT ?? 3001);
  readonly pollIntervalMs = Number(process.env.JOB_POLL_INTERVAL_MS ?? 1_000);
  readonly leaseDurationMs = Number(
    process.env.JOB_LEASE_DURATION_MS ?? 60_000,
  );
  readonly checkpointKey = Buffer.from(
    required("JOB_CHECKPOINT_KEY_BASE64"),
    "base64",
  );
  readonly contentEncryptionActiveKeyVersion = required(
    "CONTENT_ENCRYPTION_ACTIVE_KEY_VERSION",
  );
  readonly contentEncryptionKeys = new Map(
    Object.entries(
      JSON.parse(required("CONTENT_ENCRYPTION_KEYS_JSON")) as Record<
        string,
        string
      >,
    ).map(([version, value]) => [version, Buffer.from(value, "base64")]),
  );
  readonly redisUrl = process.env.REDIS_URL;
  readonly aiEnabled = process.env.RUNTIME_AI_ENABLED === "true";
  readonly aiProvider = process.env.RUNTIME_AI_PROVIDER ?? "deepseek";
  readonly aiModel = process.env.RUNTIME_AI_MODEL ?? "deepseek-v4-flash";
  readonly aiInputUsdPerMillion = Number(
    process.env.RUNTIME_AI_INPUT_USD_PER_MILLION ?? 0.14,
  );
  readonly aiOutputUsdPerMillion = Number(
    process.env.RUNTIME_AI_OUTPUT_USD_PER_MILLION ?? 0.28,
  );
  readonly aiCacheHitUsdPerMillion = Number(
    process.env.RUNTIME_AI_CACHE_HIT_USD_PER_MILLION ?? 0.0028,
  );
  readonly objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT;
  readonly objectStorageRegion = process.env.OBJECT_STORAGE_REGION ?? "auto";
  readonly objectStorageBucket = process.env.OBJECT_STORAGE_BUCKET;
  readonly objectStorageAccessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  readonly objectStorageSecretAccessKey =
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  readonly objectStoragePrefix = process.env.OBJECT_STORAGE_PREFIX ?? "sylis";
  readonly redditClientId = process.env.REDDIT_CLIENT_ID;
  readonly redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
  readonly redditUserAgent = process.env.REDDIT_USER_AGENT ?? "sylis/0.0.1";
  readonly redditSubreddits = (
    process.env.REDDIT_SUBREDDITS ?? "EnglishLearning"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  readonly redditRetentionDays = Number(
    process.env.REDDIT_RETENTION_DAYS ?? 30,
  );

  constructor() {
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65_535) {
      throw new Error("PORT must be an integer between 1 and 65535");
    }
    if (!Number.isFinite(this.pollIntervalMs) || this.pollIntervalMs < 100) {
      throw new Error("JOB_POLL_INTERVAL_MS must be at least 100");
    }
    if (
      !Number.isFinite(this.leaseDurationMs) ||
      this.leaseDurationMs < 3_000
    ) {
      throw new Error("JOB_LEASE_DURATION_MS must be at least 3000");
    }
    if (this.checkpointKey.length !== 32) {
      throw new Error("JOB_CHECKPOINT_KEY_BASE64 must decode to 32 bytes");
    }
    for (const [version, key] of this.contentEncryptionKeys) {
      if (key.length !== 32) {
        throw new Error(
          `Content encryption key ${version} must decode to 32 bytes`,
        );
      }
    }
    if (
      !this.contentEncryptionKeys.has(this.contentEncryptionActiveKeyVersion)
    ) {
      throw new Error("CONTENT_ENCRYPTION_ACTIVE_KEY_VERSION is unavailable");
    }
    for (const [name, value] of [
      ["RUNTIME_AI_INPUT_USD_PER_MILLION", this.aiInputUsdPerMillion],
      ["RUNTIME_AI_OUTPUT_USD_PER_MILLION", this.aiOutputUsdPerMillion],
      ["RUNTIME_AI_CACHE_HIT_USD_PER_MILLION", this.aiCacheHitUsdPerMillion],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a non-negative number`);
      }
    }
    if (this.aiEnabled) {
      if (this.aiProvider !== "deepseek") {
        throw new Error("RUNTIME_AI_PROVIDER must be deepseek");
      }
      required("RUNTIME_AI_API_KEY");
    }
    if (Boolean(this.redditClientId) !== Boolean(this.redditClientSecret)) {
      throw new Error(
        "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be configured together",
      );
    }
    if (
      !Number.isInteger(this.redditRetentionDays) ||
      this.redditRetentionDays < 1
    ) {
      throw new Error("REDDIT_RETENTION_DAYS must be a positive integer");
    }
  }
}
