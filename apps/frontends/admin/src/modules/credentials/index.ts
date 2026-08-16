import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const credentialQuery = (scope: AdminQueryScope) => ({
  queryKey: adminQueryKey(scope, "models", "credentials"),
  queryFn: adminApiClient.models.credentials,
});

export const credentialCommands = adminApiClient.models;
