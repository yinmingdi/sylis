import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const jobQueries = {
  list: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "jobs"),
    queryFn: adminApiClient.jobs.list,
  }),
  detail: (scope: AdminQueryScope, jobId: string) => ({
    queryKey: adminQueryKey(scope, "jobs", jobId),
    queryFn: () => adminApiClient.jobs.get(jobId),
  }),
};

export const jobCommands = adminApiClient.jobs;
