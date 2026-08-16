export interface AssetProcessorConfig {
  instanceId: string;
  adminApiUrl: string;
  agentApiUrl: string;
  modelGatewayUrl: string;
  serviceToken: string;
  clamavHost: string;
  clamavPort: number;
  port: number;
  maxAssetBytes: number;
  maxArchiveEntries: number;
  maxArchiveEntryBytes: number;
  maxArchiveExpandedBytes: number;
  maxArchiveCompressionRatio: number;
  maxDocumentPages: number;
  maxImagePixels: number;
  maxExtractedCharacters: number;
  parserTimeoutMs: number;
}

export function assetProcessorConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AssetProcessorConfig {
  return {
    instanceId: env.RAILWAY_REPLICA_ID ?? `asset-processor-${process.pid}`,
    adminApiUrl: required(env, "ADMIN_API_URL"),
    agentApiUrl: required(env, "AGENT_API_URL"),
    modelGatewayUrl: required(env, "MODEL_GATEWAY_URL"),
    serviceToken: required(env, "SERVICE_GRANT_TOKEN"),
    clamavHost: env.CLAMAV_HOST ?? "clamav",
    clamavPort: integer(env.CLAMAV_PORT, 3310),
    port: integer(env.PORT, 3600),
    maxAssetBytes: integer(env.MAX_ASSET_BYTES, 25 * 1024 * 1024),
    maxArchiveEntries: integer(env.MAX_ARCHIVE_ENTRIES, 1_000),
    maxArchiveEntryBytes: integer(
      env.MAX_ARCHIVE_ENTRY_BYTES,
      16 * 1024 * 1024,
    ),
    maxArchiveExpandedBytes: integer(
      env.MAX_ARCHIVE_EXPANDED_BYTES,
      100 * 1024 * 1024,
    ),
    maxArchiveCompressionRatio: integer(env.MAX_ARCHIVE_COMPRESSION_RATIO, 100),
    maxDocumentPages: integer(env.MAX_DOCUMENT_PAGES, 500),
    maxImagePixels: integer(env.MAX_IMAGE_PIXELS, 40_000_000),
    maxExtractedCharacters: integer(env.MAX_EXTRACTED_CHARACTERS, 2_000_000),
    parserTimeoutMs: integer(env.PARSER_TIMEOUT_MS, 120_000),
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${key}`);
  return value;
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("CONFIG_POSITIVE_INTEGER_REQUIRED");
  }
  return parsed;
}
