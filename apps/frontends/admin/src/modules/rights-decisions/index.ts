import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const rightsPolicyQuery = (scope: AdminQueryScope) => ({
  queryKey: adminQueryKey(scope, "source-datasets", "rights-policies"),
  queryFn: adminApiClient.sourceDatasets.rightsPolicies,
});

export const rightsDecisionCommands = adminApiClient.sourceDatasets;
