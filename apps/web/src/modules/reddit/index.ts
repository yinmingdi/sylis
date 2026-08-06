import { apiClient } from "@sylis/api-client";

export const redditQueries = {
  feed: (subreddit?: string) => ({
    queryKey: ["reddit", "feed", subreddit ?? "all"] as const,
    queryFn: () => apiClient.reddit.feed(subreddit),
  }),
  post: (id: string) => ({
    queryKey: ["reddit", "post", id] as const,
    queryFn: () => apiClient.reddit.post(id),
  }),
};
