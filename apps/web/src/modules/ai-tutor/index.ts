import { apiClient } from "@sylis/api-client";

export const aiQueries = {
  sessions: {
    queryKey: ["ai", "sessions"] as const,
    queryFn: () => apiClient.ai.sessions(),
  },
  messages: (id: string) => ({
    queryKey: ["ai", "messages", id] as const,
    queryFn: () => apiClient.ai.messages(id),
  }),
  usage: {
    queryKey: ["ai", "usage"] as const,
    queryFn: () => apiClient.ai.usage(),
  },
  readings: {
    queryKey: ["ai", "readings"] as const,
    queryFn: () => apiClient.ai.readings(),
  },
};
export const aiCommands = apiClient.ai;
