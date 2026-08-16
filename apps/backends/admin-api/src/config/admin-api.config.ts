import { Injectable } from "@nestjs/common";

@Injectable()
export class AdminApiConfig {
  readonly databaseUrl: string;
  readonly deploymentIngestDatabaseUrl: string;
  readonly deploymentIngestToken: string;
  readonly serviceGrantTokens: Readonly<Record<string, string>>;
  readonly checkpointKey: Uint8Array;
  readonly leaseDurationMs: number;
  readonly port: number;
  readonly adminOrigin: string;
  readonly cookieSecure: boolean;
  readonly identityApiUrl: string;
  readonly identityApiServiceToken: string;
  readonly agentApiUrl: string;
  readonly agentApiServiceToken: string;
  readonly modelGatewayUrl: string;
  readonly modelGatewayServiceToken: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.databaseUrl = required(env, "DATABASE_URL");
    this.deploymentIngestDatabaseUrl = required(
      env,
      "DEPLOYMENT_INGEST_DATABASE_URL",
    );
    this.deploymentIngestToken = required(env, "DEPLOYMENT_INGEST_TOKEN", 32);
    this.serviceGrantTokens = tokenMap(
      required(env, "SERVICE_GRANT_TOKENS_JSON"),
    );
    this.checkpointKey = key(required(env, "JOB_CHECKPOINT_KEY_BASE64"));
    this.leaseDurationMs = integer(
      env.JOB_LEASE_DURATION_MS,
      60_000,
      3_000,
      300_000,
    );
    this.port = integer(env.PORT, 3_100, 1, 65_535);
    this.adminOrigin = required(env, "ADMIN_ORIGIN");
    this.cookieSecure = (env.COOKIE_SECURE ?? "true") === "true";
    this.identityApiUrl = required(env, "IDENTITY_API_URL");
    this.identityApiServiceToken = required(
      env,
      "IDENTITY_API_SERVICE_TOKEN",
      32,
    );
    this.agentApiUrl = required(env, "AGENT_API_URL");
    this.agentApiServiceToken = required(env, "AGENT_API_SERVICE_TOKEN", 32);
    this.modelGatewayUrl = required(env, "MODEL_GATEWAY_URL");
    this.modelGatewayServiceToken = required(
      env,
      "MODEL_GATEWAY_SERVICE_TOKEN",
      32,
    );
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
      ([service, token]) =>
        !service || typeof token !== "string" || token.length < 32,
    )
  ) {
    throw new Error("SERVICE_GRANT_TOKENS_INVALID");
  }
  return parsed as Record<string, string>;
}

function key(encoded: string): Uint8Array {
  const value = Buffer.from(encoded, "base64");
  if (value.byteLength !== 32) throw new Error("JOB_CHECKPOINT_KEY_INVALID");
  return value;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("CONFIG_INTEGER_INVALID");
  }
  return parsed;
}
