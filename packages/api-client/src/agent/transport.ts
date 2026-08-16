import createClient from "openapi-fetch";

import type { paths } from "./generated/schema";

export type AgentApiPaths = paths;

export interface AgentTransportOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createAgentTransport(options: AgentTransportOptions = {}) {
  return createClient<paths>({
    baseUrl: options.baseUrl?.replace(/\/$/, "") ?? "",
    credentials: "include",
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export type AgentTransport = ReturnType<typeof createAgentTransport>;
