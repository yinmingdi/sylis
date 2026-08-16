import type { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type SwaggerCustomOptions,
} from "@nestjs/swagger";

import metadata from "./metadata";

let metadataPromise: Promise<void> | undefined;

export function loadOpenApiMetadata(): Promise<void> {
  metadataPromise ??= SwaggerModule.loadPluginMetadata(metadata);
  return metadataPromise;
}

export function createUserOpenApiDocument(
  app: INestApplication,
): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Sylis User API")
      .setDescription("Sylis user HTTP API")
      .setVersion("0.0.1")
      .addCookieAuth(
        "sylis_session",
        { type: "apiKey", in: "cookie" },
        "sylis_session",
      )
      .build(),
  );
  return userApiDocument(document);
}

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

function referencedSchemaNames(
  paths: OpenAPIObject["paths"],
  schemas: NonNullable<OpenAPIObject["components"]>["schemas"],
): Set<string> {
  const names = new Set<string>();
  const pending = [...references(paths)];
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

export function userApiDocument(source: OpenAPIObject): OpenAPIObject {
  const prefix = "/api/v1";
  const paths = Object.fromEntries(
    Object.entries(source.paths).filter(
      ([path]) => path === prefix || path.startsWith(`${prefix}/`),
    ),
  );
  if (Object.keys(paths).length === 0) {
    throw new Error(`OpenAPI document contains no user paths below ${prefix}`);
  }

  const schemaNames = referencedSchemaNames(paths, source.components?.schemas);
  const schemas = Object.fromEntries(
    Object.entries(source.components?.schemas ?? {}).filter(([name]) =>
      schemaNames.has(name),
    ),
  );

  return {
    ...source,
    openapi: "3.1.0",
    info: {
      ...source.info,
      title: "Sylis User API",
    },
    paths,
    components: {
      ...source.components,
      schemas,
    },
  } as OpenAPIObject;
}

export function setupSwaggerUi(
  app: INestApplication,
  openApi: OpenAPIObject,
  options: SwaggerCustomOptions = {},
): void {
  SwaggerModule.setup("openapi", app, openApi, {
    jsonDocumentUrl: "openapi.json",
    ...options,
  });
}
