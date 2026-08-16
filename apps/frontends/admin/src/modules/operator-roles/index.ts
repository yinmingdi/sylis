import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const operatorRoleQuery = (scope: AdminQueryScope) => ({
  queryKey: adminQueryKey(scope, "operator-roles"),
  queryFn: adminApiClient.operatorRoles.list,
});

export const operatorRoleCommands = adminApiClient.operatorRoles;
