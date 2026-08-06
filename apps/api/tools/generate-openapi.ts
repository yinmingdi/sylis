import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  audienceDocument,
  createOpenApiDocument,
  loadOpenApiMetadata,
  type ApiAudience,
} from "../src/openapi/openapi-document";

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
  const { AppModule } = await import("../src/app.module");
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });
  try {
    await loadOpenApiMetadata();
    const source = createOpenApiDocument(app);
    for (const audience of ["user", "admin"] satisfies ApiAudience[]) {
      await writeIfChanged(
        resolve(packageRoot, "openapi", `${audience}.openapi.json`),
        audienceDocument(source, audience),
      );
    }
  } finally {
    await app.close();
  }
}

await main();
