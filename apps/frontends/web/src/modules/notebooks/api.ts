import { apiClient } from '@sylis/api-client/user';

import { userQueryKey } from '../identity';

export const notebookQueries = {
  list: (userId: string) => ({
    queryKey: userQueryKey(userId, 'notebooks', 'list'),
    queryFn: () => apiClient.notebooks.list(),
  }),
  get: (userId: string, id: string) => ({
    queryKey: userQueryKey(userId, 'notebooks', id),
    queryFn: () => apiClient.notebooks.get(id),
  }),
  items: (userId: string, id: string) => ({
    queryKey: userQueryKey(userId, 'notebooks', id, 'items'),
    queryFn: () => apiClient.notebooks.items(id),
  }),
};

export const notebookCommands = apiClient.notebooks;
