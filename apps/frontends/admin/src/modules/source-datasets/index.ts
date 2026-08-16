import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const sourceDatasetQueries = {
  list: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "source-datasets"),
    queryFn: adminApiClient.sourceDatasets.list,
  }),
  synchronizations: (scope: AdminQueryScope, versionId: string) => ({
    queryKey: adminQueryKey(
      scope,
      "source-datasets",
      versionId,
      "synchronizations",
    ),
    queryFn: () => adminApiClient.sourceDatasets.synchronizations(versionId),
  }),
};

export const sourceDatasetCommands = adminApiClient.sourceDatasets;
