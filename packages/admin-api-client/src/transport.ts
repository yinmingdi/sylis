import createClient from "openapi-fetch";

import type { paths } from "./generated/schema";

export type AdminApiPaths = paths;

export interface AdminTransportOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createAdminTransport(options: AdminTransportOptions = {}) {
  return createClient<paths>({
    baseUrl: options.baseUrl?.replace(/\/$/, "") ?? "",
    credentials: "include",
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export type AdminTransport = ReturnType<typeof createAdminTransport>;
