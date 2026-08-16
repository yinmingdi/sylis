import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { clearUserQueryScope, userQueryKey } from './index';

describe('identity query scope', () => {
  it("IDENTITY-003-UNIT removes only the previous user's cached data", async () => {
    const cache = new QueryClient();
    cache.setQueryData(userQueryKey('previous-user', 'agent', 'sessions'), [
      'private-session',
    ]);
    cache.setQueryData(userQueryKey('current-user', 'agent', 'sessions'), [
      'current-session',
    ]);
    cache.setQueryData(['public', 'lexicon'], ['public-entry']);

    await clearUserQueryScope(cache, 'previous-user');

    expect(
      cache.getQueryData(userQueryKey('previous-user', 'agent', 'sessions')),
    ).toBeUndefined();
    expect(
      cache.getQueryData(userQueryKey('current-user', 'agent', 'sessions')),
    ).toEqual(['current-session']);
    expect(cache.getQueryData(['public', 'lexicon'])).toEqual(['public-entry']);
  });
});
