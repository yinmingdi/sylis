import { describe, expect, it } from "vitest";

import { automationExecutorConfigFromEnv } from "../src/config/executor-config";

describe("automationExecutorConfigFromEnv", () => {
  it("contains no model provider configuration", () => {
    const config = automationExecutorConfigFromEnv({
      DATABASE_URL: "postgresql://localhost/sylis",
      ADMIN_API_URL: "http://admin-api",
      API_URL: "http://api",
      AGENT_API_URL: "http://agent-api",
      MODEL_GATEWAY_URL: "http://model-gateway",
      SERVICE_GRANT_TOKEN: "token",
      OBJECT_STORAGE_ENDPOINT: "http://minio:9000",
      OBJECT_STORAGE_PUBLIC_ENDPOINT: "http://localhost:9000",
      OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
      QUARANTINE_BUCKET: "quarantine",
      CLEAN_ASSET_BUCKET: "clean-assets",
      EXPORT_BUCKET: "exports",
      AUDIT_ARCHIVE_BUCKET: "audit-archives",
      AUDIT_ARCHIVE_ENCRYPTION_KEYS_JSON:
        '{"v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
      AUDIT_ARCHIVE_ENCRYPTION_ACTIVE_KEY_VERSION: "v1",
      SOURCE_SYNC_ALLOWED_ORIGINS:
        "https://sources.example.com,https://mirror.example.com",
      JOB_HEARTBEAT_INTERVAL_MS: "1000",
    });
    expect(Object.keys(config)).not.toContain("aiProvider");
    expect(config.sourceSyncAllowedOrigins).toEqual([
      "https://sources.example.com",
      "https://mirror.example.com",
    ]);
    expect(config.heartbeatIntervalMs).toBe(1_000);
    expect(config.auditArchiveEncryptionKey).toHaveLength(32);
    expect(config.auditArchiveEncryptionKeyVersion).toBe("v1");
  });

  it("rejects non-HTTPS source synchronization origins", () => {
    expect(() =>
      automationExecutorConfigFromEnv({
        DATABASE_URL: "postgresql://localhost/sylis",
        ADMIN_API_URL: "http://admin-api",
        API_URL: "http://api",
        AGENT_API_URL: "http://agent-api",
        MODEL_GATEWAY_URL: "http://model-gateway",
        SERVICE_GRANT_TOKEN: "token",
        OBJECT_STORAGE_ENDPOINT: "http://minio:9000",
        OBJECT_STORAGE_PUBLIC_ENDPOINT: "http://localhost:9000",
        OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
        QUARANTINE_BUCKET: "quarantine",
        CLEAN_ASSET_BUCKET: "clean-assets",
        EXPORT_BUCKET: "exports",
        AUDIT_ARCHIVE_BUCKET: "audit-archives",
        AUDIT_ARCHIVE_ENCRYPTION_KEYS_JSON:
          '{"v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
        AUDIT_ARCHIVE_ENCRYPTION_ACTIVE_KEY_VERSION: "v1",
        SOURCE_SYNC_ALLOWED_ORIGINS: "http://metadata.internal",
      }),
    ).toThrow("CONFIG_ORIGINS_INVALID");
  });

  it("fails closed when the active audit archive key is unavailable", () => {
    expect(() =>
      automationExecutorConfigFromEnv({
        DATABASE_URL: "postgresql://localhost/sylis",
        ADMIN_API_URL: "http://admin-api",
        API_URL: "http://api",
        AGENT_API_URL: "http://agent-api",
        MODEL_GATEWAY_URL: "http://model-gateway",
        SERVICE_GRANT_TOKEN: "token",
        OBJECT_STORAGE_ENDPOINT: "http://minio:9000",
        OBJECT_STORAGE_PUBLIC_ENDPOINT: "http://localhost:9000",
        OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
        QUARANTINE_BUCKET: "quarantine",
        CLEAN_ASSET_BUCKET: "clean-assets",
        EXPORT_BUCKET: "exports",
        AUDIT_ARCHIVE_BUCKET: "audit-archives",
        AUDIT_ARCHIVE_ENCRYPTION_KEYS_JSON:
          '{"v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
        AUDIT_ARCHIVE_ENCRYPTION_ACTIVE_KEY_VERSION: "v2",
        SOURCE_SYNC_ALLOWED_ORIGINS: "https://sources.example.com",
      }),
    ).toThrow("CONFIG_AUDIT_ARCHIVE_ACTIVE_KEY_UNAVAILABLE");
  });
});
