import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import Redis from "ioredis";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type IntegrationDependencyRuntime,
  startIntegrationDependencies,
  stopIntegrationDependencies,
} from "../src";

const describeContainers =
  process.env.RUN_TESTCONTAINERS === "true" ? describe : describe.skip;

describeContainers("real integration dependencies", () => {
  let runtime: IntegrationDependencyRuntime;

  beforeAll(async () => {
    runtime = await startIntegrationDependencies();
  });

  afterAll(async () => {
    await stopIntegrationDependencies();
  });

  it("[TEST-INFRA-001-INTEGRATION] isolates PostgreSQL, Redis, and object storage state", async () => {
    const namespace = await runtime.createNamespace("dependency smoke", 1);
    const postgres = new Pool({ connectionString: runtime.postgresUrl });
    const redis = new Redis(runtime.redisUrl);
    const s3 = new S3Client(runtime.objectStorage);

    try {
      const schemas = await postgres.query<{ schema_name: string }>(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
        [namespace.postgresSchema],
      );
      expect(schemas.rows).toEqual([{ schema_name: namespace.postgresSchema }]);

      await redis.set(`${namespace.redisKeyPrefix}probe`, "isolated");
      expect(await redis.get(`${namespace.redisKeyPrefix}probe`)).toBe(
        "isolated",
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: namespace.objectStorageBucket,
          Key: "probe.txt",
          Body: "isolated",
        }),
      );
      const object = await s3.send(
        new GetObjectCommand({
          Bucket: namespace.objectStorageBucket,
          Key: "probe.txt",
        }),
      );
      expect(await object.Body?.transformToString()).toBe("isolated");
    } finally {
      await namespace.dispose();
      s3.destroy();
      redis.disconnect();
      await postgres.end();
    }
  });
});
