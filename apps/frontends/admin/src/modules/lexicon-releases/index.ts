import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const lexiconReleaseQueries = {
  list: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "lexicon", "releases"),
    queryFn: adminApiClient.releases.list,
  }),
};

export const lexiconReleaseCommands = adminApiClient.releases;
