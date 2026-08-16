import { apiClient } from '@sylis/api-client/user';

export const lexiconQueries = {
  search: (query: string) => ({
    queryKey: ['lexicon', 'search', query] as const,
    queryFn: () => apiClient.lexicon.search(query),
    enabled: query.trim().length > 0,
  }),
  headword: (id: string) => ({
    queryKey: ['lexicon', 'headword', id] as const,
    queryFn: () => apiClient.lexicon.headword(id),
  }),
  entry: (id: string) => ({
    queryKey: ['lexicon', 'entry', id] as const,
    queryFn: () => apiClient.lexicon.entry(id),
  }),
  sense: (id: string) => ({
    queryKey: ['lexicon', 'sense', id] as const,
    queryFn: () => apiClient.lexicon.sense(id),
  }),
  materials: (targetKind: 'ENTRY' | 'SENSE', id: string) => ({
    queryKey: ['lexicon', 'materials', targetKind, id] as const,
    queryFn: () =>
      targetKind === 'ENTRY'
        ? apiClient.lexicon.entryMaterials(id)
        : apiClient.lexicon.senseMaterials(id),
    enabled: Boolean(id),
  }),
};
