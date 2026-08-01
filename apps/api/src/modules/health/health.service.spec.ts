import { ServiceUnavailableException } from '@nestjs/common';

import { HealthService } from './health.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const ping = jest.fn();
  const service = new HealthService(
    { $queryRaw: queryRaw } as never,
    { getClient: () => ({ ping }) } as never,
  );

  beforeEach(() => {
    queryRaw.mockReset();
    ping.mockReset();
  });

  it('reports healthy dependencies', async () => {
    queryRaw.mockResolvedValue([{ result: 1 }]);
    ping.mockResolvedValue('PONG');

    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      dependencies: { database: 'up', redis: 'up' },
    });
  });

  it('fails when a dependency is unavailable', async () => {
    queryRaw.mockRejectedValue(new Error('database unavailable'));
    ping.mockResolvedValue('PONG');

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
