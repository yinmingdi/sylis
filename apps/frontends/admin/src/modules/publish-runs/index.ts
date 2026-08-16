import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const publishRunQueries = {
  list: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "lexicon", "publish-runs"),
    queryFn: adminApiClient.publishRuns.list,
  }),
};

export const publishRunCommands = adminApiClient.publishRuns;
