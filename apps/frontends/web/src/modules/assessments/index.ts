import { apiClient } from '@sylis/api-client/user';

import { userQueryKey } from '../identity';

export const assessmentQueries = {
  blueprints: {
    queryKey: ['assessments', 'blueprints'] as const,
    queryFn: () => apiClient.assessments.blueprints(),
  },
  session: (userId: string, id: string) => ({
    queryKey: userQueryKey(userId, 'assessments', 'session', id),
    queryFn: () => apiClient.assessments.session(id),
  }),
  result: (userId: string, id: string) => ({
    queryKey: userQueryKey(userId, 'assessments', 'result', id),
    queryFn: () => apiClient.assessments.result(id),
  }),
  history: (userId: string) => ({
    queryKey: userQueryKey(userId, 'assessments', 'history'),
    queryFn: () => apiClient.assessments.history(),
  }),
};
export const assessmentCommands = apiClient.assessments;
