import { Injectable } from "@nestjs/common";

@Injectable()
export class AgentApiConfig {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly modelGatewayUrl: string;
  readonly productApiUrl: string;
  readonly productApiServiceToken: string;
  readonly serviceGrantToken: string;
  readonly serviceGrantTokens: Readonly<Record<string, string>>;
  readonly sessionHashKey: string;
  readonly publicOrigin: string;
  readonly cookieSecure: boolean;
  readonly port: number;
  readonly objectStorageEndpoint: string;
  readonly objectStoragePublicEndpoint: string;
  readonly objectStorageRegion: string;
  readonly quarantineBucket: string;
  readonly cleanAssetBucket: string;
  readonly objectStorageAccessKeyId: string;
  readonly objectStorageSecretAccessKey: string;
  readonly objectStorageForcePathStyle: boolean;
  readonly maxAssetBytes: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.databaseUrl = required(env, "DATABASE_URL");
    this.redisUrl = required(env, "REDIS_URL");
    this.modelGatewayUrl = required(env, "MODEL_GATEWAY_URL").replace(
      /\/+$/,
      "",
    );
    this.productApiUrl = required(env, "PRODUCT_API_URL").replace(/\/+$/, "");
    this.productApiServiceToken = required(
      env,
      "PRODUCT_API_SERVICE_TOKEN",
      32,
    );
    this.serviceGrantToken = required(env, "SERVICE_GRANT_TOKEN");
    this.serviceGrantTokens = tokenMap(
      required(env, "SERVICE_GRANT_TOKENS_JSON"),
    );
    this.sessionHashKey = required(env, "SESSION_HASH_KEY", 32);
    this.publicOrigin = required(env, "PUBLIC_ORIGIN");
    this.cookieSecure = (env.COOKIE_SECURE ?? "true") === "true";
    this.port = port(env.PORT, 3_200);
    this.objectStorageEndpoint = required(env, "OBJECT_STORAGE_ENDPOINT");
    this.objectStoragePublicEndpoint =
      env.OBJECT_STORAGE_PUBLIC_ENDPOINT?.trim() || this.objectStorageEndpoint;
    this.objectStorageRegion = env.OBJECT_STORAGE_REGION?.trim() || "auto";
    this.quarantineBucket = required(env, "QUARANTINE_BUCKET");
    this.cleanAssetBucket = required(env, "CLEAN_ASSET_BUCKET");
    this.objectStorageAccessKeyId = required(
      env,
      "OBJECT_STORAGE_ACCESS_KEY_ID",
    );
    this.objectStorageSecretAccessKey = required(
      env,
      "OBJECT_STORAGE_SECRET_ACCESS_KEY",
      16,
    );
    this.objectStorageForcePathStyle =
      (env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? "true") === "true";
    this.maxAssetBytes = positiveInteger(env.MAX_ASSET_BYTES, 25 * 1024 * 1024);
  }
}

function required(env: NodeJS.ProcessEnv, name: string, minimum = 1): string {
  const value = env[name]?.trim();
  if (!value || value.length < minimum)
    throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

function tokenMap(value: string): Readonly<Record<string, string>> {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (
    Object.keys(parsed).length === 0 ||
    Object.entries(parsed).some(
      ([name, token]) =>
        !name || typeof token !== "string" || token.length < 32,
    )
  ) {
    throw new Error("SERVICE_GRANT_TOKENS_INVALID");
  }
  return parsed as Record<string, string>;
}

function port(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("CONFIG_PORT_INVALID");
  }
  return parsed;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("CONFIG_POSITIVE_INTEGER_REQUIRED");
  }
  return parsed;
}
