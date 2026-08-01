import { validateEnvironment } from './env.validation';

const validEnvironment = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sylis',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-development-secret-that-is-long-enough',
  AI_API_KEY: 'test-ai-key',
  AI_BASE_URL: 'https://api.example.com/v1',
  AI_MODEL: 'test-model',
  MAILER_HOST: 'smtp.example.com',
  MAILER_PORT: '587',
  MAILER_USER: 'test-user',
  MAILER_PASS: 'test-password',
  MAILER_FROM: 'Sylis <no-reply@example.com>',
};

describe('validateEnvironment', () => {
  it('normalizes valid environment values', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result.MAILER_PORT).toBe(587);
    expect(result.MAILER_SECURE).toBe(false);
    expect(result.JWT_EXPIRES_IN).toBe('30d');
  });

  it('rejects a missing AI key', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, AI_API_KEY: '' }),
    ).toThrow('AI_API_KEY is required');
  });

  it('rejects a weak JWT secret', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_SECRET: 'too-short' }),
    ).toThrow('JWT_SECRET must be at least 32 characters');
  });

  it('requires Reddit credentials as a pair', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, REDDIT_CLIENT_ID: 'client' }),
    ).toThrow('REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET');
  });
});
