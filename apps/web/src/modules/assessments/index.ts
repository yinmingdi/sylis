import { apiClient } from "@sylis/api-client";

export const assessmentQueries = {
  blueprints: {
    queryKey: ["assessments", "blueprints"] as const,
    queryFn: () => apiClient.assessments.blueprints(),
  },
  session: (id: string) => ({
    queryKey: ["assessments", "session", id] as const,
    queryFn: () => apiClient.assessments.session(id),
  }),
  result: (id: string) => ({
    queryKey: ["assessments", "result", id] as const,
    queryFn: () => apiClient.assessments.result(id),
  }),
  history: {
    queryKey: ["assessments", "history"] as const,
    queryFn: () => apiClient.assessments.history(),
  },
};
export const assessmentCommands = apiClient.assessments;
