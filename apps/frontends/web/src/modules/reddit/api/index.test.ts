import { apiClient } from '@sylis/api-client/user';
import { describe, expect, it, vi } from 'vitest';

import { unsavePost } from './index';

describe('Reddit reading adapter', () => {
  it('REDDIT-001-UNIT does not report success when the saved post cannot be resolved', async () => {
    vi.spyOn(apiClient.reading, 'library').mockResolvedValue([]);
    const unsave = vi.spyOn(apiClient.reading, 'unsave');

    await expect(unsavePost('t3_missing-post')).rejects.toThrow(
      'Saved Reddit post missing-post was not found',
    );
    expect(unsave).not.toHaveBeenCalled();
  });
});
