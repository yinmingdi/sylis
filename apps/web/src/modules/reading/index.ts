import { apiClient } from "@sylis/api-client";

export const readingQueries = {
  document: (id: string) => ({
    queryKey: ["reading", "document", id] as const,
    queryFn: () => apiClient.reading.document(id),
  }),
  annotations: (revisionId: string) => ({
    queryKey: ["reading", "annotations", revisionId] as const,
    queryFn: () => apiClient.reading.annotations(revisionId),
    enabled: Boolean(revisionId),
  }),
  history: {
    queryKey: ["reading", "history"] as const,
    queryFn: () => apiClient.reading.history(),
  },
  saved: {
    queryKey: ["reading", "saved"] as const,
    queryFn: () => apiClient.reading.saved(),
  },
};
export const readingCommands = apiClient.reading;
