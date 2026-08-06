import { describe, expect, it } from "vitest";

import { compilerRunnerConfigFromEnv } from "./runner-config";

const base = {
  DATABASE_URL: "postgresql://test",
  JOB_CHECKPOINT_KEY_BASE64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

describe("compilerRunnerConfigFromEnv", () => {
  it("keeps work and artifacts inside the attached Railway volume", () => {
    expect(
      compilerRunnerConfigFromEnv({
        ...base,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
      }),
    ).toMatchObject({
      aiEnabled: false,
      workRoot: "/data/lexicon-compiler/work",
      artifactRoot: "/data/lexicon-compiler/artifacts",
    });
    expect(() =>
      compilerRunnerConfigFromEnv({
        ...base,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        LEXICON_ARTIFACT_ROOT: "/tmp/artifacts",
      }),
    ).toThrow("LEXICON_ARTIFACT_ROOT must be inside RAILWAY_VOLUME_MOUNT_PATH");
  });

  it("only enables compiler AI when explicitly configured", () => {
    expect(
      compilerRunnerConfigFromEnv({ ...base, LEXICON_AI_ENABLED: "true" })
        .aiEnabled,
    ).toBe(true);
    expect(
      compilerRunnerConfigFromEnv({ ...base, LEXICON_AI_ENABLED: "false" })
        .aiEnabled,
    ).toBe(false);
  });

  it("rejects local artifact publication in production", () => {
    expect(() =>
      compilerRunnerConfigFromEnv({
        ...base,
        NODE_ENV: "production",
        LEXICON_ARTIFACT_ALLOW_FILE: "true",
      }),
    ).toThrow("LEXICON_ARTIFACT_ALLOW_FILE cannot be enabled in production");
  });

  it("rejects invalid polling and lease values", () => {
    expect(() =>
      compilerRunnerConfigFromEnv({ ...base, JOB_POLL_INTERVAL_MS: "0" }),
    ).toThrow("JOB_POLL_INTERVAL_MS must be an integer between 100");
    expect(() =>
      compilerRunnerConfigFromEnv({ ...base, JOB_LEASE_DURATION_MS: "NaN" }),
    ).toThrow("JOB_LEASE_DURATION_MS must be an integer between 3000");
  });
});
