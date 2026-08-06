import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  PUBLIC_ORIGIN: z.string().url(),
  ADMIN_ORIGIN: z.string().url(),
  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_RP_NAME: z.string().min(1).default("Sylis"),
  SESSION_HASH_KEY: z.string().min(32),
  CSRF_SIGNING_KEY: z.string().min(32),
  REGISTRATION_SIGNING_KEY: z.string().min(32),
  CONTENT_ENCRYPTION_KEYS_JSON: z.string().min(2),
  CONTENT_ENCRYPTION_ACTIVE_KEY_VERSION: z.string().min(1),
  COOKIE_SECURE: z.enum(["true", "false"]).default("true"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  value: Record<string, unknown>,
): ApiEnvironment {
  return environmentSchema.parse(value);
}
