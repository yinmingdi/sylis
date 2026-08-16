import { adminApiClient, type AdminAuditQuery } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const auditQueries = {
  security: (scope: AdminQueryScope, filter: AdminAuditQuery) => ({
    queryKey: adminQueryKey(scope, "audit", "security", filter),
    queryFn: () => adminApiClient.audit.securityEvents(filter),
  }),
  dataAccess: (scope: AdminQueryScope, filter: AdminAuditQuery) => ({
    queryKey: adminQueryKey(scope, "audit", "data-access", filter),
    queryFn: () => adminApiClient.audit.dataAccessEvents(filter),
  }),
  legalHolds: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "audit", "legal-holds"),
    queryFn: adminApiClient.audit.legalHolds,
  }),
  retention: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "audit", "retention"),
    queryFn: adminApiClient.audit.retention,
  }),
  exports: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "audit", "exports"),
    queryFn: adminApiClient.audit.exports,
  }),
};

export const auditCommands = adminApiClient.audit;
