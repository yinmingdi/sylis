import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const aiUsageQuery = (scope: AdminQueryScope) => ({
  queryKey: adminQueryKey(scope, "models", "usage"),
  queryFn: adminApiClient.models.usage,
});

export const aiUsageCommands = adminApiClient.models;
