import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  RedisContainer,
  type StartedRedisContainer,
} from "@testcontainers/redis";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

import { createTestNamespace } from "./test-contract";

export interface IntegrationNamespaceNames {
  id: string;
  postgresSchema: string;
  redisKeyPrefix: string;
  objectStorageBucket: string;
}

export interface IntegrationObjectStorageConfig {
  endpoint: string;
  region: string;
  forcePathStyle: true;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export interface IntegrationTestNamespace extends IntegrationNamespaceNames {
  databaseUrl: string;
  dispose(): Promise<void>;
}

export interface IntegrationDependencyRuntime {
  postgresUrl: string;
  redisUrl: string;
  objectStorage: IntegrationObjectStorageConfig;
  createNamespace(
    identity: string,
    sequence: number,
  ): Promise<IntegrationTestNamespace>;
  stop(): Promise<void>;
}

const postgresImage = "postgres:18-bookworm";
const redisImage = "redis:7.4-alpine";
const minioImage = "minio/minio:RELEASE.2025-04-22T22-12-26Z";
const minioAccessKey = "sylis-integration";
const minioSecretKey = "sylis-integration-secret";

let runtimePromise: Promise<IntegrationDependencyRuntime> | undefined;

export function integrationNamespaceNames(
  identity: string,
  sequence: number,
): IntegrationNamespaceNames {
  const id = createTestNamespace(identity, sequence);
  return {
    id,
    postgresSchema: boundedName(`test_${id.replaceAll("-", "_")}`, 63, "_"),
    redisKeyPrefix: `sylis:test:${id}:`,
    objectStorageBucket: boundedName(`sylis-${id}`, 63, "-"),
  };
}

export function startIntegrationDependencies(): Promise<IntegrationDependencyRuntime> {
  runtimePromise ??= startRuntime();
  return runtimePromise;
}

export async function stopIntegrationDependencies(): Promise<void> {
  const active = runtimePromise;
  runtimePromise = undefined;
  if (active) await (await active).stop();
}

async function startRuntime(): Promise<IntegrationDependencyRuntime> {
  const starts = await Promise.allSettled([
    new PostgreSqlContainer(postgresImage)
      .withDatabase("sylis_integration")
      .withUsername("sylis")
      .withPassword("sylis-integration")
      .start(),
    new RedisContainer(redisImage).start(),
    new GenericContainer(minioImage)
      .withEnvironment({
        MINIO_ROOT_USER: minioAccessKey,
        MINIO_ROOT_PASSWORD: minioSecretKey,
      })
      .withCommand(["server", "/data"])
      .withExposedPorts(9000)
      .withWaitStrategy(
        Wait.forHttp("/minio/health/ready", 9000).forStatusCode(200),
      )
      .start(),
  ]);
  const failure = starts.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) {
    await Promise.allSettled(
      starts
        .filter(
          (result): result is PromiseFulfilledResult<StartedTestContainer> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value.stop()),
    );
    throw failure.reason;
  }

  const postgres = settledValue(starts[0]) as StartedPostgreSqlContainer;
  const redis = settledValue(starts[1]) as StartedRedisContainer;
  const minio = settledValue(starts[2]);
  const postgresUrl = postgres.getConnectionUri();
  const redisUrl = redis.getConnectionUrl();
  const objectStorage: IntegrationObjectStorageConfig = {
    endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: minioAccessKey,
      secretAccessKey: minioSecretKey,
    },
  };
  const pool = new Pool({ connectionString: postgresUrl });
  const s3 = new S3Client(objectStorage);
  const namespaces = new Map<string, IntegrationNamespaceNames>();
  let stopped = false;

  async function dispose(names: IntegrationNamespaceNames): Promise<void> {
    if (!namespaces.delete(names.id)) return;
    await Promise.allSettled([
      pool.query(`DROP SCHEMA IF EXISTS "${names.postgresSchema}" CASCADE`),
      deleteBucket(s3, names.objectStorageBucket),
    ]);
  }

  return {
    postgresUrl,
    redisUrl,
    objectStorage,
    async createNamespace(identity, sequence) {
      if (stopped) throw new Error("Integration dependency runtime is stopped");
      const names = integrationNamespaceNames(identity, sequence);
      if (namespaces.has(names.id)) {
        throw new Error(`Integration namespace already exists: ${names.id}`);
      }
      await pool.query(`CREATE SCHEMA "${names.postgresSchema}"`);
      try {
        await s3.send(
          new CreateBucketCommand({ Bucket: names.objectStorageBucket }),
        );
      } catch (error) {
        await pool.query(`DROP SCHEMA "${names.postgresSchema}" CASCADE`);
        throw error;
      }
      namespaces.set(names.id, names);
      const databaseUrl = new URL(postgresUrl);
      databaseUrl.searchParams.set("schema", names.postgresSchema);
      return {
        ...names,
        databaseUrl: databaseUrl.toString(),
        dispose: () => dispose(names),
      };
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await Promise.all([...namespaces.values()].map(dispose));
      s3.destroy();
      await pool.end();
      await Promise.all([postgres.stop(), redis.stop(), minio.stop()]);
    },
  };
}

async function deleteBucket(client: S3Client, bucket: string): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );
    if (page.Contents?.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: page.Contents.flatMap((object) =>
              object.Key ? [{ Key: object.Key }] : [],
            ),
          },
        }),
      );
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
  await client.send(new DeleteBucketCommand({ Bucket: bucket }));
}

function boundedName(value: string, limit: number, separator: string): string {
  if (value.length <= limit) return value;
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `${value.slice(0, limit - hash.length - 1)}${separator}${hash}`;
}

function settledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") throw result.reason;
  return result.value;
}
