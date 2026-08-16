import { adminApiClient } from "@sylis/api-client/admin";

import { adminQueryKey, type AdminQueryScope } from "../identity";

export const reviewQueries = {
  batches: (scope: AdminQueryScope) => ({
    queryKey: adminQueryKey(scope, "reviews", "batches"),
    queryFn: adminApiClient.reviews.batches,
  }),
  batch: (scope: AdminQueryScope, batchId: string) => ({
    queryKey: adminQueryKey(scope, "reviews", "batches", batchId),
    queryFn: () => adminApiClient.reviews.batch(batchId),
  }),
};

export const reviewCommands = adminApiClient.reviews;
