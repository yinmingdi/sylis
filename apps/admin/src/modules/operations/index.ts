import { adminApiClient } from "@sylis/admin-api-client";

export const operationQueries = {
  dashboard: {
    queryKey: ["admin", "dashboard"] as const,
    queryFn: adminApiClient.dashboard,
  },
  builds: {
    queryKey: ["admin", "builds"] as const,
    queryFn: adminApiClient.builds.list,
  },
  imports: {
    queryKey: ["admin", "imports"] as const,
    queryFn: adminApiClient.imports.list,
  },
  releases: {
    queryKey: ["admin", "releases"] as const,
    queryFn: adminApiClient.releases.list,
  },
  jobs: {
    queryKey: ["admin", "jobs"] as const,
    queryFn: adminApiClient.jobs.list,
  },
  rights: {
    queryKey: ["admin", "rights"] as const,
    queryFn: adminApiClient.sourceRights,
  },
  audit: {
    queryKey: ["admin", "audit"] as const,
    queryFn: adminApiClient.audit,
  },
  usage: {
    queryKey: ["admin", "usage"] as const,
    queryFn: adminApiClient.aiUsage,
  },
  runtimeAi: {
    queryKey: ["admin", "runtime-ai"] as const,
    queryFn: adminApiClient.runtimeAi.get,
  },
  users: (query = "") => ({
    queryKey: ["admin", "users", query] as const,
    queryFn: () => adminApiClient.users.list(query),
  }),
  adminSessions: (userId: string) => ({
    queryKey: ["admin", "users", userId, "admin-sessions"] as const,
    queryFn: () => adminApiClient.users.adminSessions(userId),
  }),
  deployments: {
    queryKey: ["admin", "deployments"] as const,
    queryFn: adminApiClient.deployments.list,
  },
};
export const operationCommands = adminApiClient;
