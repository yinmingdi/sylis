import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const buildRunQueries = {
  list: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "lexicon", "build-runs"),
    queryFn: adminApiClient.builds.list,
  }),
};

export const buildRunCommands = adminApiClient.builds;
