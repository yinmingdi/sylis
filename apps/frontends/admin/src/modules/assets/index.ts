import { adminApiClient } from "@sylis/api-client/admin";
import { adminQueryKey, type AdminQueryScope } from "../identity";

export const assetQueries = {
  list: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "assets"),
    queryFn: adminApiClient.assets.list,
  }),
  detail: (scope: AdminQueryScope, assetId: string) => ({
    queryKey: adminQueryKey(scope, "assets", assetId),
    queryFn: () => adminApiClient.assets.get(assetId),
  }),
};
