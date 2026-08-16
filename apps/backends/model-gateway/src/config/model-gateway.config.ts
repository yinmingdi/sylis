import { Injectable } from "@nestjs/common";

@Injectable()
export class ModelGatewayConfig {
  readonly databaseUrl: string;
  readonly serviceGrantTokens: Readonly<Record<string, string>>;
  readonly credentialKekVersion: string;
  readonly credentialKeks: Readonly<Record<string, Uint8Array>>;
  readonly credentialFingerprintKey: Uint8Array;
  readonly contentKekVersion: string;
  readonly contentKeks: Readonly<Record<string, Uint8Array>>;
  readonly port: number;
  readonly deepSeekBaseUrl: string;
  readonly openAiBaseUrl: string;
  readonly anthropicBaseUrl: string;
  readonly geminiBaseUrl: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.databaseUrl = required(env, "DATABASE_URL");
    this.serviceGrantTokens = parseServiceTokens(
      required(env, "SERVICE_GRANT_TOKENS_JSON"),
    );
    this.credentialKekVersion = required(env, "CREDENTIAL_KEK_ACTIVE_VERSION");
    this.credentialKeks = parseKeys(required(env, "CREDENTIAL_KEK_KEYS_JSON"));
    if (!this.credentialKeks[this.credentialKekVersion]) {
      throw new Error("CREDENTIAL_KEK_ACTIVE_VERSION_NOT_FOUND");
    }
    this.credentialFingerprintKey = parseKey(
      required(env, "CREDENTIAL_FINGERPRINT_KEY_BASE64"),
      "CREDENTIAL_FINGERPRINT_KEY_INVALID",
    );
    this.contentKekVersion = required(env, "MODEL_CONTENT_KEK_ACTIVE_VERSION");
    this.contentKeks = parseKeys(required(env, "MODEL_CONTENT_KEK_KEYS_JSON"));
    if (!this.contentKeks[this.contentKekVersion]) {
      throw new Error("MODEL_CONTENT_KEK_ACTIVE_VERSION_NOT_FOUND");
    }
    this.port = integer(env.PORT, 3300);
    this.deepSeekBaseUrl = (
      env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
    ).replace(/\/+$/, "");
    this.openAiBaseUrl = (
      env.OPENAI_BASE_URL ?? "https://api.openai.com"
    ).replace(/\/+$/, "");
    this.anthropicBaseUrl = (
      env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"
    ).replace(/\/+$/, "");
    this.geminiBaseUrl = (
      env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com"
    ).replace(/\/+$/, "");
  }
}

function parseServiceTokens(value: string): Readonly<Record<string, string>> {
  const parsed = JSON.parse(value) as Record<string, string>;
  if (
    Object.keys(parsed).length === 0 ||
    Object.entries(parsed).some(
      ([serviceKey, token]) =>
        !serviceKey || typeof token !== "string" || token.length < 32,
    )
  ) {
    throw new Error("SERVICE_GRANT_TOKENS_INVALID");
  }
  return parsed;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${key}`);
  return value;
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("CONFIG_PORT_INVALID");
  }
  return parsed;
}

function parseKeys(value: string): Readonly<Record<string, Uint8Array>> {
  const parsed = JSON.parse(value) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(parsed).map(([version, encoded]) => {
      const key = Buffer.from(encoded, "base64");
      if (key.byteLength !== 32)
        throw new Error(`CREDENTIAL_KEK_INVALID:${version}`);
      return [version, key];
    }),
  );
}

function parseKey(value: string, errorCode: string): Uint8Array {
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== 32) throw new Error(errorCode);
  return key;
}
