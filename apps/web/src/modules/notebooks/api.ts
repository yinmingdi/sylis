import { apiClient } from "@sylis/api-client";

export const notebookQueries = {
  list: {
    queryKey: ["notebooks", "list"] as const,
    queryFn: () => apiClient.notebooks.list(),
  },
  get: (id: string) => ({
    queryKey: ["notebooks", id] as const,
    queryFn: () => apiClient.notebooks.get(id),
  }),
  items: (id: string) => ({
    queryKey: ["notebooks", id, "items"] as const,
    queryFn: () => apiClient.notebooks.items(id),
  }),
};

export const notebookCommands = apiClient.notebooks;
