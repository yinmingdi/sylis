import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const providerRouteQuery = (scope: AdminQueryScope) => ({
  queryKey: adminQueryKey(scope, "models", "routes"),
  queryFn: adminApiClient.models.routes,
});

export const providerRouteCommands = adminApiClient.models;
