import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeploymentService } from "@sylis/utils/release-identity";

import type { ApiEnvironment } from "./env.schema";

const DEPLOYMENT_READINESS_VARIABLE = {
  [DeploymentService.ADMIN_API]: "DEPLOYMENT_ADMIN_API_READINESS_URL",
  [DeploymentService.AGENT_API]: "DEPLOYMENT_AGENT_API_READINESS_URL",
  [DeploymentService.MODEL_GATEWAY]: "DEPLOYMENT_MODEL_GATEWAY_READINESS_URL",
  [DeploymentService.AGENT_EXECUTOR]: "DEPLOYMENT_AGENT_EXECUTOR_READINESS_URL",
  [DeploymentService.AGENT_EVALUATOR]:
    "DEPLOYMENT_AGENT_EVALUATOR_READINESS_URL",
  [DeploymentService.ASSET_PROCESSOR]:
    "DEPLOYMENT_ASSET_PROCESSOR_READINESS_URL",
  [DeploymentService.AUTOMATION_EXECUTOR]:
    "DEPLOYMENT_AUTOMATION_EXECUTOR_READINESS_URL",
  [DeploymentService.LEXICON_BUILDER]:
    "DEPLOYMENT_LEXICON_BUILDER_READINESS_URL",
  [DeploymentService.LEXICON_PUBLISHER]:
    "DEPLOYMENT_LEXICON_PUBLISHER_READINESS_URL",
} as const satisfies Record<string, keyof ApiEnvironment>;

export type ProxiedDeploymentService =
  keyof typeof DEPLOYMENT_READINESS_VARIABLE;

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

  get serviceGrantTokens(): Readonly<Record<string, string>> {
    const value = JSON.parse(
      this.values.get("SERVICE_GRANT_TOKENS_JSON", { infer: true }),
    ) as Record<string, unknown>;
    if (
      Object.keys(value).length === 0 ||
      Object.entries(value).some(
        ([service, token]) =>
          !service || typeof token !== "string" || token.length < 32,
      )
    ) {
      throw new Error("SERVICE_GRANT_TOKENS_INVALID");
    }
    return value as Record<string, string>;
  }

  get agentApiUrl() {
    return this.values.get("AGENT_API_URL", { infer: true });
  }

  get agentApiServiceToken() {
    return this.values.get("AGENT_API_SERVICE_TOKEN", { infer: true });
  }

  get modelGatewayUrl() {
    return this.values.get("MODEL_GATEWAY_URL", { infer: true });
  }

  get modelGatewayServiceToken() {
    return this.values.get("MODEL_GATEWAY_SERVICE_TOKEN", { infer: true });
  }

  deploymentReadinessUrl(service: ProxiedDeploymentService) {
    return this.values.get(DEPLOYMENT_READINESS_VARIABLE[service], {
      infer: true,
    });
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

  get userSessionIdleTtlSeconds() {
    return this.values.get("USER_SESSION_IDLE_TTL_SECONDS", { infer: true });
  }

  get adminSessionIdleTtlSeconds() {
    return this.values.get("ADMIN_SESSION_IDLE_TTL_SECONDS", { infer: true });
  }

  get userContentRetentionMs() {
    return this.values.get("USER_CONTENT_RETENTION_MS", { infer: true });
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
