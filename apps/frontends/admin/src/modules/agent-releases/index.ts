import { adminApiClient } from "@sylis/api-client/admin";
import { queryOptions } from "@tanstack/react-query";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const adminAgentReleaseQueries = {
  list: (scope: AdminQueryScope) =>
    queryOptions({
      queryKey: adminQueryKey(scope, "agent-releases"),
      queryFn: () => adminApiClient.agents.releases(),
    }),
};

export const adminAgentReleaseCommands = adminApiClient.agents;
