import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const overviewQuery = (scope: AdminQueryScope) => ({
  queryKey: adminQueryKey(scope, "overview"),
  queryFn: adminApiClient.overview,
});
