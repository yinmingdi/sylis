import { describe, expect, it } from "vitest";

import { importerConfigFromEnv } from "./importer-config";

const base = {
  DATABASE_URL: "postgresql://test",
  JOB_CHECKPOINT_KEY_BASE64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

describe("importerConfigFromEnv", () => {
  it("uses the importer directory below the Railway volume", () => {
    expect(
      importerConfigFromEnv({ ...base, RAILWAY_VOLUME_MOUNT_PATH: "/data" }),
    ).toMatchObject({ workRoot: "/data/lexicon-importer/work" });
  });

  it("rejects work outside the attached volume", () => {
    expect(() =>
      importerConfigFromEnv({
        ...base,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        LEXICON_IMPORTER_WORK_ROOT: "/tmp/import",
      }),
    ).toThrow(
      "LEXICON_IMPORTER_WORK_ROOT must be inside RAILWAY_VOLUME_MOUNT_PATH",
    );
  });

  it("rejects invalid numeric settings", () => {
    expect(() => importerConfigFromEnv({ ...base, PORT: "0" })).toThrow(
      "PORT must be an integer between 1 and 65535",
    );
  });
});
