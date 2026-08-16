import { readFile } from "node:fs/promises";

import { UsageError } from "./arguments.mjs";

export const DeploymentManifestSchema = Object.freeze({
  V1: "sylis.deployment-manifest/1",
});

export const DeploymentReadinessStatus = Object.freeze({
  READY: "ready",
});

export const DeploymentService = Object.freeze({
  WEB: "web",
  ADMIN: "admin",
  API: "api",
  ADMIN_API: "admin-api",
  AGENT_API: "agent-api",
  MODEL_GATEWAY: "model-gateway",
  AGENT_EXECUTOR: "agent-executor",
  AGENT_EVALUATOR: "agent-evaluator",
  ASSET_PROCESSOR: "asset-processor",
  AUTOMATION_EXECUTOR: "automation-executor",
  LEXICON_BUILDER: "lexicon-builder",
  LEXICON_PUBLISHER: "lexicon-publisher",
});

const DEPLOYMENT_SERVICES = Object.values(DeploymentService).sort();

export async function readDeploymentManifest(path) {
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new UsageError(
      `Unable to read deployment manifest ${path}: ${error.message}`,
    );
  }
  if (
    value?.schemaVersion !== DeploymentManifestSchema.V1 ||
    typeof value.version !== "string" ||
    !value.version ||
    typeof value.commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.commit) ||
    !Array.isArray(value.images) ||
    value.images.length === 0
  ) {
    throw new UsageError(`Invalid deployment manifest ${path}`);
  }
  const services = new Set();
  for (const image of value.images) {
    if (
      typeof image?.application !== "string" ||
      !image.application ||
      typeof image.image !== "string" ||
      !image.image ||
      image.commit !== value.commit ||
      services.has(image.application)
    ) {
      throw new UsageError(
        `Invalid image identity in deployment manifest ${path}`,
      );
    }
    services.add(image.application);
  }
  if (
    JSON.stringify([...services].sort()) !== JSON.stringify(DEPLOYMENT_SERVICES)
  ) {
    throw new UsageError(
      `Deployment manifest must contain exactly: ${DEPLOYMENT_SERVICES.join(", ")}`,
    );
  }
  return value;
}

export function deploymentEndpoints(values, encoded) {
  const entries = [];
  if (encoded?.trim()) {
    let parsed;
    try {
      parsed = JSON.parse(encoded);
    } catch {
      throw new UsageError("SYLIS_DEPLOYMENT_ENDPOINTS must be a JSON object");
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new UsageError("SYLIS_DEPLOYMENT_ENDPOINTS must be a JSON object");
    }
    entries.push(...Object.entries(parsed));
  }
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) {
      throw new UsageError("--service-url must use <service>=<url>");
    }
    entries.push([value.slice(0, separator), value.slice(separator + 1)]);
  }

  const endpoints = new Map();
  for (const [service, rawUrl] of entries) {
    if (endpoints.has(service)) {
      throw new UsageError(`Duplicate deployment endpoint for ${service}`);
    }
    const url = new URL(String(rawUrl));
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new UsageError(`Invalid deployment endpoint for ${service}`);
    }
    endpoints.set(service, url.toString());
  }
  return endpoints;
}

export function deploymentEndpointsFromOrigins(
  manifest,
  { apiOrigin, webOrigin, adminOrigin },
) {
  const origins = {
    api: deploymentOrigin("SYLIS_API_URL", apiOrigin),
    web: deploymentOrigin("SYLIS_WEB_URL", webOrigin),
    admin: deploymentOrigin("SYLIS_ADMIN_URL", adminOrigin),
  };
  return new Map(
    manifest.images.map(({ application }) => {
      if (application === "web") {
        return [application, new URL("/version.json", origins.web).toString()];
      }
      if (application === "admin") {
        return [
          application,
          new URL("/version.json", origins.admin).toString(),
        ];
      }
      return [
        application,
        new URL(`/health/deployment/${application}`, origins.api).toString(),
      ];
    }),
  );
}

export async function rehearseDeployment({
  manifest,
  endpoints,
  fetchImpl = fetch,
}) {
  const expectedServices = manifest.images
    .map((image) => image.application)
    .sort();
  const suppliedServices = [...endpoints.keys()].sort();
  if (JSON.stringify(suppliedServices) !== JSON.stringify(expectedServices)) {
    throw new UsageError(
      `Deployment endpoints must exactly match manifest services: ${expectedServices.join(", ")}`,
    );
  }

  return Promise.all(
    expectedServices.map(async (service) => {
      const url = endpoints.get(service);
      const startedAt = Date.now();
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const text = (await response.text()).slice(0, 2_000);
      if (!response.ok) {
        throw new Error(`${service} ${url} returned HTTP ${response.status}`);
      }
      let identity;
      try {
        identity = JSON.parse(text);
      } catch {
        throw new Error(`${service} ${url} did not return JSON readiness`);
      }
      const mismatch = [
        ["status", DeploymentReadinessStatus.READY],
        ["service", service],
        ["version", manifest.version],
        ["commitSha", manifest.commit],
      ].find(([name, expected]) => identity?.[name] !== expected);
      if (mismatch) {
        const [name, expected] = mismatch;
        throw new Error(
          `${service} ${name} mismatch: expected ${expected}, received ${String(identity?.[name])}`,
        );
      }
      return {
        service,
        url,
        status: response.status,
        version: identity.version,
        commitSha: identity.commitSha,
        durationMs: Date.now() - startedAt,
      };
    }),
  );
}

function deploymentOrigin(name, value) {
  if (!value?.trim()) throw new UsageError(`${name} is required`);
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new UsageError(
      `${name} must be an HTTP(S) origin without credentials`,
    );
  }
  return url.origin;
}
