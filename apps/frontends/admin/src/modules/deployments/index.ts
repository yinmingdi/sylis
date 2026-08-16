import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const deploymentQuery = (scope: AdminQueryScope) => ({
  queryKey: adminQueryKey(scope, "deployments"),
  queryFn: adminApiClient.deployments.list,
});
