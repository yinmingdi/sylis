import { adminApiClient } from "@sylis/api-client/admin";
import { queryOptions } from "@tanstack/react-query";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const adminAgentRunQueries = {
  list: (scope: AdminQueryScope) =>
    queryOptions({
      queryKey: adminQueryKey(scope, "agent-runs"),
      queryFn: () => adminApiClient.agents.runs(),
    }),
};

export const adminAgentRunCommands = {
  previewTermination: adminApiClient.agents.previewRunTermination,
  terminate: adminApiClient.agents.terminateRun,
};
