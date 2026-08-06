import { apiClient } from "@sylis/api-client";
import { infiniteQueryOptions } from "@tanstack/react-query";

const nextPosition = (value: unknown): number | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const position = (value as Record<string, unknown>).nextPosition;
  return typeof position === "number" ? position : undefined;
};

export const booksQueries = {
  list: {
    queryKey: ["books", "list"] as const,
    queryFn: () => apiClient.books.list(),
  },
  edition: (bookId: string, editionId: string) =>
    infiniteQueryOptions({
      queryKey: ["books", bookId, editionId] as const,
      initialPageParam: -1,
      queryFn: ({ pageParam }) =>
        apiClient.books.edition(bookId, editionId, pageParam),
      getNextPageParam: nextPosition,
    }),
  enrollments: {
    queryKey: ["books", "enrollments"] as const,
    queryFn: () => apiClient.books.enrollments(),
  },
};
export const booksCommands = apiClient.books;
