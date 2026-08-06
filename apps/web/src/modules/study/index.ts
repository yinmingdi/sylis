import { apiClient } from "@sylis/api-client";

export const studyQueries = {
  today: {
    queryKey: ["study", "today"] as const,
    queryFn: () => apiClient.study.today(),
  },
  stats: {
    queryKey: ["study", "stats"] as const,
    queryFn: () => apiClient.study.stats(),
  },
  objective: (id: string) => ({
    queryKey: ["study", "objective", id] as const,
    queryFn: () => apiClient.study.objective(id),
  }),
};
export const studyCommands = apiClient.study;
