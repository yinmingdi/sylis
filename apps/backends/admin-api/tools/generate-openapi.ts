import { NestFactory } from "@nestjs/core";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from "@nestjs/swagger";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AdminApiModule } from "../src/app.module";

const publicPrefix = "/api/admin/v1";

function references(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) references(item, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string") result.add(item);
    else references(item, result);
  }
  return result;
}

function referencedSchemaNames(source: OpenAPIObject): Set<string> {
  const names = new Set<string>();
  const pending = [...references(source.paths)];
  const schemas = source.components?.schemas;
  while (pending.length > 0) {
    const reference = pending.pop();
    const prefix = "#/components/schemas/";
    if (!reference?.startsWith(prefix)) continue;
    const name = decodeURIComponent(reference.slice(prefix.length));
    if (names.has(name)) continue;
    names.add(name);
    const schema = schemas?.[name];
    if (schema) pending.push(...references(schema));
  }
  return names;
}

function publicDocument(source: OpenAPIObject): OpenAPIObject {
  const paths = Object.fromEntries(
    Object.entries(source.paths).filter(
      ([path]) => path === publicPrefix || path.startsWith(`${publicPrefix}/`),
    ),
  );
  if (Object.keys(paths).length === 0) {
    throw new Error(`OpenAPI document contains no paths below ${publicPrefix}`);
  }
  const projected = { ...source, paths };
  const schemaNames = referencedSchemaNames(projected);
  return {
    ...projected,
    openapi: "3.1.0",
    components: {
      ...source.components,
      schemas: Object.fromEntries(
        Object.entries(source.components?.schemas ?? {}).filter(([name]) =>
          schemaNames.has(name),
        ),
      ),
    },
  } as OpenAPIObject;
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
  const app = await NestFactory.create(AdminApiModule, {
    abortOnError: false,
    logger: false,
    preview: true,
  });
  const source = {
    ...SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Sylis Admin API")
        .setVersion("0.0.1")
        .addCookieAuth(
          "sylis_admin_session",
          { type: "apiKey", in: "cookie" },
          "sylis_admin_session",
        )
        .build(),
    ),
    openapi: "3.1.0",
  } as OpenAPIObject;
  try {
    await writeIfChanged(
      resolve("openapi", "admin.openapi.json"),
      publicDocument(source),
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
