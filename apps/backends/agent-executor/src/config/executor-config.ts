export interface AgentExecutorConfig {
  instanceId: string;
  adminApiUrl: string;
  agentApiUrl: string;
  modelGatewayUrl: string;
  productApiUrl: string;
  serviceToken: string;
  braveSearchApiKey: string;
  publicWebSearchUrl: string;
  publicWebPrivateFixtureOrigins: readonly string[];
  port: number;
  heartbeatIntervalMs: number;
  leaseDurationMs: number;
  pollIntervalMs: number;
  reconciliationIntervalMs: number;
  publicWebSearchTimeoutMs: number;
  publicWebPageTimeoutMs: number;
  publicWebPageMaxBytes: number;
  publicWebMaxRedirects: number;
  maxParallelToolCalls: number;
}

export function agentExecutorConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AgentExecutorConfig {
  const publicWebOverrides = testOnlyPublicWebOverrides(env);
  return {
    instanceId: env.RAILWAY_REPLICA_ID ?? `agent-executor-${process.pid}`,
    adminApiUrl: required(env, "ADMIN_API_URL"),
    agentApiUrl: required(env, "AGENT_API_URL"),
    modelGatewayUrl: required(env, "MODEL_GATEWAY_URL"),
    productApiUrl: required(env, "PRODUCT_API_URL"),
    serviceToken: required(env, "SERVICE_GRANT_TOKEN"),
    braveSearchApiKey: required(env, "BRAVE_SEARCH_API_KEY"),
    publicWebSearchUrl:
      publicWebOverrides.searchUrl ??
      "https://api.search.brave.com/res/v1/web/search",
    publicWebPrivateFixtureOrigins: publicWebOverrides.privateOrigins,
    port: positiveInteger(env.PORT, 3400),
    heartbeatIntervalMs: positiveInteger(env.JOB_HEARTBEAT_INTERVAL_MS, 10_000),
    leaseDurationMs: positiveInteger(env.JOB_LEASE_DURATION_MS, 60_000),
    pollIntervalMs: positiveInteger(env.JOB_POLL_INTERVAL_MS, 1_000),
    reconciliationIntervalMs: positiveInteger(
      env.AGENT_RECONCILIATION_INTERVAL_MS,
      5_000,
    ),
    publicWebSearchTimeoutMs: positiveInteger(
      env.PUBLIC_WEB_SEARCH_TIMEOUT_MS,
      10_000,
    ),
    publicWebPageTimeoutMs: positiveInteger(
      env.PUBLIC_WEB_PAGE_TIMEOUT_MS,
      10_000,
    ),
    publicWebPageMaxBytes: positiveInteger(
      env.PUBLIC_WEB_PAGE_MAX_BYTES,
      1_000_000,
    ),
    publicWebMaxRedirects: nonNegativeInteger(env.PUBLIC_WEB_MAX_REDIRECTS, 3),
    maxParallelToolCalls: positiveInteger(env.AGENT_MAX_PARALLEL_TOOL_CALLS, 4),
  };
}

function testOnlyPublicWebOverrides(env: NodeJS.ProcessEnv): {
  searchUrl?: string;
  privateOrigins: readonly string[];
} {
  const searchUrl = optionalHttpsUrl(env.PUBLIC_WEB_SEARCH_URL);
  const privateOrigins = (env.PUBLIC_WEB_PRIVATE_FIXTURE_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => httpsOrigin(value));
  if ((searchUrl || privateOrigins.length > 0) && env.NODE_ENV !== "test") {
    throw new Error("CONFIG_TEST_ONLY_PUBLIC_WEB_OVERRIDE");
  }
  return { ...(searchUrl ? { searchUrl } : {}), privateOrigins };
}

function optionalHttpsUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const url = new URL(normalized);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("CONFIG_PUBLIC_WEB_HTTPS_URL_REQUIRED");
  }
  return url.toString();
}

function httpsOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("CONFIG_PUBLIC_WEB_HTTPS_ORIGIN_REQUIRED");
  }
  return url.origin;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${key}`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("CONFIG_POSITIVE_INTEGER_REQUIRED");
  }
  return parsed;
}

function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("CONFIG_NON_NEGATIVE_INTEGER_REQUIRED");
  }
  return parsed;
}
