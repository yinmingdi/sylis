const REQUIRED_STRING_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL',
  'MAILER_HOST',
  'MAILER_USER',
  'MAILER_PASS',
  'MAILER_FROM',
] as const;

const URL_PROTOCOLS: Record<string, string[]> = {
  DATABASE_URL: ['postgres:', 'postgresql:'],
  REDIS_URL: ['redis:', 'rediss:'],
  AI_BASE_URL: ['http:', 'https:'],
};

function requireString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value.trim();
}

function requireUrl(key: string, value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Environment variable ${key} must be a valid URL`);
  }

  if (!URL_PROTOCOLS[key].includes(parsed.protocol)) {
    throw new Error(`Environment variable ${key} uses an unsupported protocol`);
  }
}

export function validateEnvironment(input: Record<string, unknown>) {
  const config = { ...input };

  for (const key of REQUIRED_STRING_KEYS) {
    config[key] = requireString(config, key);
  }

  for (const key of Object.keys(URL_PROTOCOLS)) {
    requireUrl(key, config[key] as string);
  }

  if ((config.JWT_SECRET as string).length < 32) {
    throw new Error('Environment variable JWT_SECRET must be at least 32 characters');
  }

  const mailerPort = Number(config.MAILER_PORT);
  if (!Number.isInteger(mailerPort) || mailerPort < 1 || mailerPort > 65535) {
    throw new Error('Environment variable MAILER_PORT must be a valid TCP port');
  }

  if (Boolean(config.REDDIT_CLIENT_ID) !== Boolean(config.REDDIT_CLIENT_SECRET)) {
    throw new Error('REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be configured together');
  }

  config.MAILER_PORT = mailerPort;
  config.MAILER_SECURE = String(config.MAILER_SECURE ?? 'false') === 'true';
  config.JWT_EXPIRES_IN = config.JWT_EXPIRES_IN || '30d';
  config.NODE_ENV = config.NODE_ENV || 'development';

  return config;
}
