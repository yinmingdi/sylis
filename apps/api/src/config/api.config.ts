import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ApiEnvironment } from "./env.schema";

@Injectable()
export class ApiConfig {
  constructor(private readonly values: ConfigService<ApiEnvironment, true>) {}

  get nodeEnv() {
    return this.values.get("NODE_ENV", { infer: true });
  }

  get port() {
    return this.values.get("PORT", { infer: true });
  }

  get databaseUrl() {
    return this.values.get("DATABASE_URL", { infer: true });
  }

  get redisUrl() {
    return this.values.get("REDIS_URL", { infer: true });
  }

  get publicOrigin() {
    return this.values.get("PUBLIC_ORIGIN", { infer: true });
  }

  get adminOrigin() {
    return this.values.get("ADMIN_ORIGIN", { infer: true });
  }

  get webAuthnRpId() {
    return this.values.get("WEBAUTHN_RP_ID", { infer: true });
  }

  get webAuthnRpName() {
    return this.values.get("WEBAUTHN_RP_NAME", { infer: true });
  }

  get sessionHashKey() {
    return this.values.get("SESSION_HASH_KEY", { infer: true });
  }

  get csrfSigningKey() {
    return this.values.get("CSRF_SIGNING_KEY", { infer: true });
  }

  get registrationSigningKey() {
    return this.values.get("REGISTRATION_SIGNING_KEY", { infer: true });
  }

  get contentEncryptionKeys(): ReadonlyMap<string, Buffer> {
    const encoded = JSON.parse(
      this.values.get("CONTENT_ENCRYPTION_KEYS_JSON", { infer: true }),
    ) as Record<string, string>;
    const keys = new Map(
      Object.entries(encoded).map(([version, value]) => [
        version,
        Buffer.from(value, "base64"),
      ]),
    );
    for (const [version, key] of keys) {
      if (key.length !== 32) {
        throw new Error(
          `Content encryption key ${version} must decode to 32 bytes`,
        );
      }
    }
    return keys;
  }

  get contentEncryptionActiveKeyVersion() {
    return this.values.get("CONTENT_ENCRYPTION_ACTIVE_KEY_VERSION", {
      infer: true,
    });
  }

  get cookieSecure() {
    return this.values.get("COOKIE_SECURE", { infer: true }) === "true";
  }

  get sessionTtlSeconds() {
    return this.values.get("SESSION_TTL_SECONDS", { infer: true });
  }

  get smtp() {
    return {
      host: this.values.get("SMTP_HOST", { infer: true }),
      port: this.values.get("SMTP_PORT", { infer: true }),
      user: this.values.get("SMTP_USER", { infer: true }),
      password: this.values.get("SMTP_PASSWORD", { infer: true }),
      from: this.values.get("SMTP_FROM", { infer: true }),
    };
  }
}
