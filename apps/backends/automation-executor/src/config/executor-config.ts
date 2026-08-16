export interface AutomationExecutorConfig {
  instanceId: string;
  databaseUrl: string;
  adminApiUrl: string;
  apiUrl: string;
  agentApiUrl: string;
  modelGatewayUrl: string;
  serviceToken: string;
  port: number;
  objectStorageEndpoint: string;
  objectStoragePublicEndpoint: string;
  objectStorageRegion: string;
  objectStorageForcePathStyle: boolean;
  objectStorageAccessKeyId: string;
  objectStorageSecretAccessKey: string;
  quarantineBucket: string;
  cleanAssetBucket: string;
  exportBucket: string;
  auditArchiveBucket: string;
  auditArchiveEncryptionKey: Uint8Array;
  auditArchiveEncryptionKeyVersion: string;
  sourceSyncAllowedOrigins: string[];
  heartbeatIntervalMs: number;
  failpoint: AutomationFailpoint;
  failpointDelayMs: number;
}

export enum AutomationFailpoint {
  NONE = "NONE",
  DATA_EXPORT_AFTER_COLLECTING = "DATA_EXPORT_AFTER_COLLECTING",
}

export function automationExecutorConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AutomationExecutorConfig {
  return {
    instanceId: env.RAILWAY_REPLICA_ID ?? `automation-executor-${process.pid}`,
    databaseUrl: required(env, "DATABASE_URL"),
    adminApiUrl: required(env, "ADMIN_API_URL"),
    apiUrl: required(env, "API_URL"),
    agentApiUrl: required(env, "AGENT_API_URL"),
    modelGatewayUrl: required(env, "MODEL_GATEWAY_URL"),
    serviceToken: required(env, "SERVICE_GRANT_TOKEN"),
    port: integer(env.PORT, 3700),
    objectStorageEndpoint: required(env, "OBJECT_STORAGE_ENDPOINT"),
    objectStoragePublicEndpoint: required(
      env,
      "OBJECT_STORAGE_PUBLIC_ENDPOINT",
    ),
    objectStorageRegion: env.OBJECT_STORAGE_REGION?.trim() || "auto",
    objectStorageForcePathStyle: boolean(
      env.OBJECT_STORAGE_FORCE_PATH_STYLE,
      true,
    ),
    objectStorageAccessKeyId: required(env, "OBJECT_STORAGE_ACCESS_KEY_ID"),
    objectStorageSecretAccessKey: required(
      env,
      "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    ),
    quarantineBucket: required(env, "QUARANTINE_BUCKET"),
    cleanAssetBucket: required(env, "CLEAN_ASSET_BUCKET"),
    exportBucket: required(env, "EXPORT_BUCKET"),
    auditArchiveBucket: required(env, "AUDIT_ARCHIVE_BUCKET"),
    ...auditArchiveEncryption(env),
    sourceSyncAllowedOrigins: origins(
      required(env, "SOURCE_SYNC_ALLOWED_ORIGINS"),
    ),
    heartbeatIntervalMs: integer(env.JOB_HEARTBEAT_INTERVAL_MS, 10_000),
    failpoint: enumValue(
      AutomationFailpoint,
      env.AUTOMATION_FAILPOINT ?? AutomationFailpoint.NONE,
    ),
    failpointDelayMs: integer(env.AUTOMATION_FAILPOINT_DELAY_MS, 1, 1, 30_000),
  };
}

function auditArchiveEncryption(
  env: NodeJS.ProcessEnv,
): Pick<
  AutomationExecutorConfig,
  "auditArchiveEncryptionKey" | "auditArchiveEncryptionKeyVersion"
> {
  const activeVersion = required(
    env,
    "AUDIT_ARCHIVE_ENCRYPTION_ACTIVE_KEY_VERSION",
  );
  let values: unknown;
  try {
    values = JSON.parse(required(env, "AUDIT_ARCHIVE_ENCRYPTION_KEYS_JSON"));
  } catch (error) {
    throw new Error("CONFIG_AUDIT_ARCHIVE_KEYS_INVALID", { cause: error });
  }
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("CONFIG_AUDIT_ARCHIVE_KEYS_INVALID");
  }
  const encoded = (values as Record<string, unknown>)[activeVersion];
  if (typeof encoded !== "string") {
    throw new Error("CONFIG_AUDIT_ARCHIVE_ACTIVE_KEY_UNAVAILABLE");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32 || key.toString("base64") !== encoded) {
    throw new Error("CONFIG_AUDIT_ARCHIVE_KEY_LENGTH");
  }
  return {
    auditArchiveEncryptionKey: key,
    auditArchiveEncryptionKeyVersion: activeVersion,
  };
}

function origins(value: string): string[] {
  const result = [...new Set(value.split(",").map((entry) => entry.trim()))];
  if (result.length === 0 || result.some((entry) => !entry)) {
    throw new Error("CONFIG_ORIGINS_INVALID");
  }
  for (const entry of result) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch (error) {
      throw new Error("CONFIG_ORIGINS_INVALID", { cause: error });
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("CONFIG_ORIGINS_INVALID");
    }
  }
  return result.map((entry) => new URL(entry).origin);
}

function boolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("CONFIG_BOOLEAN_INVALID");
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${key}`);
  return value;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("CONFIG_INTEGER_INVALID");
  }
  return parsed;
}

function enumValue<T extends Record<string, string>>(
  values: T,
  value: string,
): T[keyof T] {
  if (Object.values(values).includes(value)) return value as T[keyof T];
  throw new Error("CONFIG_ENUM_INVALID");
}
