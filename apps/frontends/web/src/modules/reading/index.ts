import { apiClient } from '@sylis/api-client/user';

import { userQueryKey } from '../identity';

export const readingQueries = {
  document: (userId: string, id: string) => ({
    queryKey: userQueryKey(userId, 'reading', 'document', id),
    queryFn: () => apiClient.reading.document(id),
  }),
  annotations: (userId: string, revisionId: string) => ({
    queryKey: userQueryKey(userId, 'reading', 'annotations', revisionId),
    queryFn: () => apiClient.reading.annotations(revisionId),
    enabled: Boolean(revisionId),
  }),
  targets: (userId: string, revisionId: string) => ({
    queryKey: userQueryKey(userId, 'reading', 'targets', revisionId),
    queryFn: () => apiClient.reading.targets(revisionId),
    enabled: Boolean(revisionId),
  }),
  history: (userId: string) => ({
    queryKey: userQueryKey(userId, 'reading', 'history'),
    queryFn: () => apiClient.reading.history(),
  }),
  library: (userId: string) => ({
    queryKey: userQueryKey(userId, 'reading', 'library'),
    queryFn: () => apiClient.reading.library(),
  }),
};
export const readingCommands = apiClient.reading;
