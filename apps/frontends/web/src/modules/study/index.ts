import { apiClient } from '@sylis/api-client/user';

import { userQueryKey } from '../identity';

export const studyQueries = {
  today: (userId: string) => ({
    queryKey: userQueryKey(userId, 'study', 'today'),
    queryFn: () => apiClient.study.today(),
  }),
  stats: (userId: string) => ({
    queryKey: userQueryKey(userId, 'study', 'stats'),
    queryFn: () => apiClient.study.stats(),
  }),
  objective: (userId: string, id: string) => ({
    queryKey: userQueryKey(userId, 'study', 'objective', id),
    queryFn: () => apiClient.study.objective(id),
  }),
};
export const studyCommands = apiClient.study;
