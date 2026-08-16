import { apiClient } from '@sylis/api-client/user';
import { infiniteQueryOptions } from '@tanstack/react-query';

import { userQueryKey } from '../identity';

const nextPosition = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const position = (value as Record<string, unknown>).nextPosition;
  return typeof position === 'number' ? position : undefined;
};

export const booksQueries = {
  list: {
    queryKey: ['books', 'list'] as const,
    queryFn: () => apiClient.books.list().then((response) => response.data),
  },
  edition: (bookId: string, editionId: string) =>
    infiniteQueryOptions({
      queryKey: ['books', bookId, editionId] as const,
      initialPageParam: -1,
      queryFn: ({ pageParam }) =>
        apiClient.books
          .edition(bookId, editionId, pageParam)
          .then((response) => response.data),
      getNextPageParam: nextPosition,
    }),
  enrollments: (userId: string) => ({
    queryKey: userQueryKey(userId, 'books', 'enrollments'),
    queryFn: () => apiClient.books.enrollments(),
  }),
};
export const booksCommands = apiClient.books;
