import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const userSupportQuery = (scope: AdminQueryScope, query: string) => ({
  queryKey: adminQueryKey(scope, "user-support", query),
  queryFn: () => adminApiClient.userSupport.users(query),
});

export const userSupportCommands = adminApiClient.userSupport;
