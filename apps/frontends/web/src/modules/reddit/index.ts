import { apiClient } from '@sylis/api-client/user';

import { userQueryKey } from '../identity';

export const redditQueries = {
  feed: (userId: string, subreddit?: string) => ({
    queryKey: userQueryKey(userId, 'reddit', 'feed', subreddit ?? 'all'),
    queryFn: () => apiClient.reddit.feed(subreddit),
  }),
  post: (userId: string, id: string) => ({
    queryKey: userQueryKey(userId, 'reddit', 'post', id),
    queryFn: () => apiClient.reddit.post(id),
  }),
};

export * from './api';
