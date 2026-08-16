export enum TestLayer {
  UNIT = "UNIT",
  PROPERTY = "PROPERTY",
  COMPONENT = "COMPONENT",
  INTEGRATION = "INTEGRATION",
  CONTRACT = "CONTRACT",
  SYSTEM = "SYSTEM",
  BROWSER_E2E = "BROWSER_E2E",
  AI_EVAL = "AI_EVAL",
  SYNTHETIC = "SYNTHETIC",
}

export enum TestRunner {
  VITEST = "VITEST",
  PLAYWRIGHT = "PLAYWRIGHT",
  NODE_TEST = "NODE_TEST",
}

export enum TestTag {
  CORE = "CORE",
  BROWSER = "BROWSER",
  SYSTEM = "SYSTEM",
  ACCESSIBILITY = "ACCESSIBILITY",
  MOBILE = "MOBILE",
  CROSS_BROWSER = "CROSS_BROWSER",
  SECURITY = "SECURITY",
  AI_EVAL = "AI_EVAL",
  DEPLOYMENT = "DEPLOYMENT",
  NIGHTLY = "NIGHTLY",
}

export enum RiskLevel {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  STANDARD = "STANDARD",
}

export enum CiLane {
  PULL_REQUEST = "PULL_REQUEST",
  MAIN = "MAIN",
  NIGHTLY = "NIGHTLY",
  STAGING = "STAGING",
  PRODUCTION = "PRODUCTION",
  MANUAL = "MANUAL",
}

export enum BrowserTarget {
  CHROMIUM = "CHROMIUM",
  FIREFOX = "FIREFOX",
  WEBKIT = "WEBKIT",
  MOBILE_CHROMIUM = "MOBILE_CHROMIUM",
}

export enum ApiAudience {
  USER = "USER",
  ADMIN = "ADMIN",
  AGENT = "AGENT",
}

export enum ApiAuthenticationMode {
  PUBLIC = "PUBLIC",
  USER_SESSION = "USER_SESSION",
  ADMIN_SESSION = "ADMIN_SESSION",
  SERVICE_GRANT = "SERVICE_GRANT",
}

export enum OpenApiPathMatch {
  EXACT = "EXACT",
  PREFIX = "PREFIX",
}

export enum HttpMethod {
  GET = "GET",
  PUT = "PUT",
  POST = "POST",
  DELETE = "DELETE",
  OPTIONS = "OPTIONS",
  HEAD = "HEAD",
  PATCH = "PATCH",
  TRACE = "TRACE",
}

export function createTestNamespace(
  identity: string,
  sequence: number,
): string {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("Test sequence must be a non-negative integer");
  }

  const normalizedIdentity = identity
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalizedIdentity.length === 0) {
    throw new Error("Test identity must contain letters or numbers");
  }

  return `${normalizedIdentity}-${sequence}`;
}
