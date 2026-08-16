import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const { createUserOpenApiDocument, loadOpenApiMetadata } = nodeRequire(
  "../dist/openapi/openapi-document",
) as typeof import("../src/openapi/openapi-document");

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const generationEnvironment: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://openapi:openapi@localhost:5432/openapi",
  PUBLIC_ORIGIN: "http://localhost:5173",
  ADMIN_ORIGIN: "http://localhost:5180",
  WEBAUTHN_RP_ID: "localhost",
  WEBAUTHN_RP_NAME: "Sylis OpenAPI",
  SESSION_HASH_KEY: "openapi-session-hash-key-000000000000000000000000",
  CSRF_SIGNING_KEY: "openapi-csrf-signing-key-00000000000000000000000",
  REGISTRATION_SIGNING_KEY: "openapi-registration-key-00000000000000000000",
  SERVICE_GRANT_TOKENS_JSON:
    '{"agent-api":"openapi-agent-api-token-00000000000000000000","agent-executor":"openapi-agent-executor-token-000000000000000"}',
  AGENT_API_URL: "http://localhost:3200",
  AGENT_API_SERVICE_TOKEN:
    "openapi-agent-api-service-token-00000000000000000000",
  MODEL_GATEWAY_URL: "http://localhost:3300",
  MODEL_GATEWAY_SERVICE_TOKEN:
    "openapi-model-gateway-service-token-0000000000000000",
  CONTENT_ENCRYPTION_KEYS_JSON:
    '{"openapi":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
  CONTENT_ENCRYPTION_ACTIVE_KEY_VERSION: "openapi",
  COOKIE_SECURE: "false",
};

function configureEnvironment(): void {
  for (const [name, value] of Object.entries(generationEnvironment)) {
    process.env[name] ??= value;
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]),
  );
}

async function writeIfChanged(path: string, value: unknown): Promise<void> {
  const contents = `${JSON.stringify(stable(value), null, 2)}\n`;
  const previous = await readFile(path, "utf8").catch(() => null);
  if (previous === contents) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

async function main(): Promise<void> {
  configureEnvironment();
  const { API_OPENAPI_MODULES } = nodeRequire(
    "../dist/app.module",
  ) as typeof import("../src/app.module");
  class ApiOpenApiModule {}
  Module({ imports: [...API_OPENAPI_MODULES] })(ApiOpenApiModule);
  const app = await NestFactory.create(ApiOpenApiModule, {
    abortOnError: false,
    logger: false,
    preview: true,
  });
  try {
    await loadOpenApiMetadata();
    await writeIfChanged(
      resolve(packageRoot, "openapi", "user.openapi.json"),
      createUserOpenApiDocument(app),
    );
  } finally {
    await app.close();
  }
}

const keepAlive = setInterval(() => undefined, 1_000);
void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
