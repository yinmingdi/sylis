import { apiClient } from '@sylis/api-client/user';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { booksQueries } from './index';

vi.mock('@sylis/api-client/user', () => ({
  apiClient: {
    books: {
      list: vi.fn(),
      edition: vi.fn(),
      enrollments: vi.fn(),
    },
  },
}));

describe('booksQueries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('projects the active-release book list data', async () => {
    vi.mocked(apiClient.books.list).mockResolvedValue({
      releaseId: 'release-id',
      releaseVersion: '0.0.1',
      data: [{ id: 'book-id' }],
    });

    await expect(booksQueries.list.queryFn()).resolves.toEqual([
      { id: 'book-id' },
    ]);
  });

  it('projects edition data and advances from its next position', async () => {
    vi.mocked(apiClient.books.edition).mockResolvedValue({
      releaseId: 'release-id',
      releaseVersion: '0.0.1',
      data: { id: 'edition-id', items: [], nextPosition: 42 },
    });
    const options = booksQueries.edition('book-id', 'edition-id');

    const page = await options.queryFn!({ pageParam: -1 } as never);

    expect(page).toEqual({ id: 'edition-id', items: [], nextPosition: 42 });
    expect(options.getNextPageParam?.(page, [], -1, [])).toBe(42);
  });
});
