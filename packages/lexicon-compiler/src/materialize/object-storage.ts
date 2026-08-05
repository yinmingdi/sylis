import {
  HeadObjectCommand,
  S3Client,
  type HeadObjectOutput,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Agent } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { basename, resolve } from "node:path";

export type ObjectPublishStage =
  | "VERIFY_LOCAL"
  | "CHECK_REMOTE"
  | "UPLOAD"
  | "VERIFY_REMOTE";

export interface ObjectPublishProgressEvent {
  stage: ObjectPublishStage;
  processedBytes: number;
  totalBytes: number;
  reused: boolean;
}

export interface ObjectPublishProgressPort {
  report(event: ObjectPublishProgressEvent): void;
}

export const silentObjectPublishProgress: ObjectPublishProgressPort = {
  report: () => undefined,
};

export interface RemoteObjectMetadata {
  byteSize: number;
  sha256: string | null;
}

export interface ContentAddressedObjectStoragePort {
  readonly bucket: string;
  head(key: string): Promise<RemoteObjectMetadata | null>;
  upload(options: {
    key: string;
    path: string;
    byteSize: number;
    sha256: string;
    contentType: string;
    onProgress(processedBytes: number): void;
  }): Promise<void>;
}

export interface PublishContentAddressedObjectOptions {
  inputPath: string;
  sha256: string;
  objectName?: string;
  contentType?: string;
  progress?: ObjectPublishProgressPort;
}

export interface PublishContentAddressedObjectResult {
  objectManifestVersion: "sylis.content-addressed-object/1";
  uri: string;
  bucket: string;
  key: string;
  sha256: string;
  byteSize: number;
  contentType: string;
  reused: boolean;
}

export interface S3ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  queueSize?: number;
  partSize?: number;
  endpointIp?: string;
  maxAttempts?: number;
}

function normalizeSha256(value: string): string {
  const normalized = value.replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Object checksum must be a 64-character SHA-256 value.");
  }
  return normalized;
}

function requiredEnvironment(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function assertObjectName(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(
      "Object name may contain only letters, digits, dot, underscore and hyphen.",
    );
  }
  return value;
}

function normalizeRemoteSha256(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return normalizeSha256(value);
  } catch {
    return null;
  }
}

function remoteMetadata(output: HeadObjectOutput): RemoteObjectMetadata {
  return {
    byteSize: output.ContentLength ?? -1,
    sha256: normalizeRemoteSha256(output.Metadata?.sha256),
  };
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey"
  );
}

async function verifyLocalFile(
  path: string,
  expectedSha256: string,
  byteSize: number,
  progress: ObjectPublishProgressPort,
): Promise<void> {
  const hash = createHash("sha256");
  let processedBytes = 0;
  progress.report({
    stage: "VERIFY_LOCAL",
    processedBytes,
    totalBytes: byteSize,
    reused: false,
  });
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    processedBytes += Buffer.byteLength(chunk);
  }
  progress.report({
    stage: "VERIFY_LOCAL",
    processedBytes,
    totalBytes: byteSize,
    reused: false,
  });
  if (hash.digest("hex") !== expectedSha256) {
    throw new Error("Object source checksum mismatch.");
  }
}

function assertRemoteObject(
  remote: RemoteObjectMetadata | null,
  byteSize: number,
  sha256: string,
): asserts remote is RemoteObjectMetadata {
  if (!remote) throw new Error("Published object is missing after upload.");
  if (remote.byteSize !== byteSize || remote.sha256 !== sha256) {
    throw new Error("Content-addressed remote object metadata mismatch.");
  }
}

export function s3ObjectStorageConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): S3ObjectStorageConfig {
  const endpoint = requiredEnvironment(env, "AWS_ENDPOINT_URL");
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== "https:") {
    throw new Error("AWS_ENDPOINT_URL must use HTTPS.");
  }
  const urlStyle = env.AWS_S3_URL_STYLE ?? "virtual";
  if (
    urlStyle !== "virtual" &&
    urlStyle !== "virtual-host" &&
    urlStyle !== "path"
  ) {
    throw new Error("AWS_S3_URL_STYLE must be virtual, virtual-host or path.");
  }
  const endpointIp = env.AWS_ENDPOINT_IP;
  if (endpointIp && isIP(endpointIp) === 0) {
    throw new Error("AWS_ENDPOINT_IP must be an IPv4 or IPv6 address.");
  }
  return {
    endpoint: parsedEndpoint.href,
    region: requiredEnvironment(env, "AWS_DEFAULT_REGION"),
    bucket: requiredEnvironment(env, "AWS_S3_BUCKET_NAME"),
    accessKeyId: requiredEnvironment(env, "AWS_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment(env, "AWS_SECRET_ACCESS_KEY"),
    forcePathStyle: urlStyle === "path",
    endpointIp,
  };
}

export function createPinnedEndpointLookup(endpointIp: string): LookupFunction {
  const family = isIP(endpointIp);
  if (family === 0) {
    throw new Error("Pinned endpoint must be an IPv4 or IPv6 address.");
  }
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: endpointIp, family }]);
      return;
    }
    callback(null, endpointIp, family);
  };
}

export function createS3ObjectStoragePort(
  config: S3ObjectStorageConfig,
): ContentAddressedObjectStoragePort {
  const requestHandler = config.endpointIp
    ? new NodeHttpHandler({
        httpsAgent: new Agent({
          keepAlive: true,
          lookup: createPinnedEndpointLookup(config.endpointIp),
        }),
      })
    : undefined;
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    maxAttempts: config.maxAttempts ?? 8,
    requestHandler,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return {
    bucket: config.bucket,
    async head(key) {
      try {
        return remoteMetadata(
          await client.send(
            new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
          ),
        );
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async upload(options) {
      const upload = new Upload({
        client,
        params: {
          Bucket: config.bucket,
          Key: options.key,
          Body: createReadStream(options.path),
          ContentLength: options.byteSize,
          ContentType: options.contentType,
          Metadata: { sha256: options.sha256 },
        },
        queueSize: config.queueSize ?? 4,
        partSize: config.partSize ?? 16 * 1024 * 1024,
        leavePartsOnError: false,
      });
      upload.on("httpUploadProgress", (event) => {
        options.onProgress(event.loaded ?? 0);
      });
      await upload.done();
    },
  };
}

export async function publishContentAddressedObject(
  options: PublishContentAddressedObjectOptions,
  storage: ContentAddressedObjectStoragePort,
): Promise<PublishContentAddressedObjectResult> {
  const inputPath = resolve(options.inputPath);
  const expectedSha256 = normalizeSha256(options.sha256);
  const objectName = assertObjectName(
    options.objectName ?? basename(inputPath),
  );
  const contentType = options.contentType ?? "application/octet-stream";
  const progress = options.progress ?? silentObjectPublishProgress;
  const file = await stat(inputPath);
  if (!file.isFile() || file.size < 1) {
    throw new Error("Object source must be a non-empty regular file.");
  }
  await verifyLocalFile(inputPath, expectedSha256, file.size, progress);

  const key = `sha256/${expectedSha256}/${objectName}`;
  progress.report({
    stage: "CHECK_REMOTE",
    processedBytes: 0,
    totalBytes: file.size,
    reused: false,
  });
  const existing = await storage.head(key);
  if (existing) {
    assertRemoteObject(existing, file.size, expectedSha256);
    progress.report({
      stage: "VERIFY_REMOTE",
      processedBytes: file.size,
      totalBytes: file.size,
      reused: true,
    });
    return {
      objectManifestVersion: "sylis.content-addressed-object/1",
      uri: `s3://${storage.bucket}/${key}`,
      bucket: storage.bucket,
      key,
      sha256: `sha256:${expectedSha256}`,
      byteSize: file.size,
      contentType,
      reused: true,
    };
  }

  progress.report({
    stage: "UPLOAD",
    processedBytes: 0,
    totalBytes: file.size,
    reused: false,
  });
  await storage.upload({
    key,
    path: inputPath,
    byteSize: file.size,
    sha256: expectedSha256,
    contentType,
    onProgress(processedBytes) {
      progress.report({
        stage: "UPLOAD",
        processedBytes,
        totalBytes: file.size,
        reused: false,
      });
    },
  });
  const published = await storage.head(key);
  assertRemoteObject(published, file.size, expectedSha256);
  progress.report({
    stage: "VERIFY_REMOTE",
    processedBytes: file.size,
    totalBytes: file.size,
    reused: false,
  });
  return {
    objectManifestVersion: "sylis.content-addressed-object/1",
    uri: `s3://${storage.bucket}/${key}`,
    bucket: storage.bucket,
    key,
    sha256: `sha256:${expectedSha256}`,
    byteSize: file.size,
    contentType,
    reused: false,
  };
}
