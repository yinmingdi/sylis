import createClient from "openapi-fetch";

import type { paths } from "./generated/schema";

export type UserApiPaths = paths;

export interface UserTransportOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createUserTransport(options: UserTransportOptions = {}) {
  return createClient<paths>({
    baseUrl: options.baseUrl?.replace(/\/$/, "") ?? "",
    credentials: "include",
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export type UserTransport = ReturnType<typeof createUserTransport>;
