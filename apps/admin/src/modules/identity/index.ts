import { adminApiClient } from "@sylis/admin-api-client";

export const adminSessionQuery = {
  queryKey: ["admin", "session"] as const,
  queryFn: () => adminApiClient.auth.session(),
  retry: false,
};
export const adminIdentityCommands = adminApiClient.auth;
export * from "./admin-reauthentication";
