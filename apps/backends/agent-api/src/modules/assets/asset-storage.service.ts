import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";

import { AgentApiConfig } from "../../config/agent-api.config";

@Injectable()
export class AssetStorageService {
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;

  constructor(private readonly config: AgentApiConfig) {
    const options = {
      region: config.objectStorageRegion,
      forcePathStyle: config.objectStorageForcePathStyle,
      credentials: {
        accessKeyId: config.objectStorageAccessKeyId,
        secretAccessKey: config.objectStorageSecretAccessKey,
      },
    } as const;
    this.internalClient = new S3Client({
      ...options,
      endpoint: config.objectStorageEndpoint,
    });
    this.publicClient = new S3Client({
      ...options,
      endpoint: config.objectStoragePublicEndpoint,
    });
  }

  putUrl(
    bucket: "quarantine" | "clean",
    key: string,
    input: { mimeType: string; byteSize: number; contentHash: string },
    audience: AssetUrlAudience,
  ): Promise<string> {
    return getSignedUrl(
      this.client(audience),
      new PutObjectCommand({
        Bucket: this.bucket(bucket),
        Key: key,
        ContentType: input.mimeType,
        ContentLength: input.byteSize,
        ChecksumSHA256: Buffer.from(input.contentHash, "hex").toString(
          "base64",
        ),
      }),
      { expiresIn: 900 },
    );
  }

  getUrl(
    bucket: "quarantine" | "clean",
    key: string,
    audience: AssetUrlAudience,
  ): Promise<string> {
    return getSignedUrl(
      this.client(audience),
      new GetObjectCommand({ Bucket: this.bucket(bucket), Key: key }),
      { expiresIn: 300 },
    );
  }

  head(
    bucket: "quarantine" | "clean",
    key: string,
  ): Promise<HeadObjectCommandOutput> {
    return this.internalClient.send(
      new HeadObjectCommand({
        Bucket: this.bucket(bucket),
        Key: key,
        ChecksumMode: "ENABLED",
      }),
    );
  }

  async ensureCleanObject(
    key: string,
    body: Buffer,
    mimeType: string,
    contentHash: string,
  ): Promise<{ objectVersion: string }> {
    try {
      const existing = await this.head("clean", key);
      const checksum = Buffer.from(contentHash, "hex").toString("base64");
      if (
        existing.ContentLength !== body.byteLength ||
        existing.ContentType !== mimeType ||
        (existing.ChecksumSHA256 && existing.ChecksumSHA256 !== checksum)
      ) {
        throw new Error("CLEAN_OBJECT_CONTENT_ADDRESS_COLLISION");
      }
      return {
        objectVersion: existing.VersionId ?? existing.ETag ?? "unversioned",
      };
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    const created = await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.bucket("clean"),
        Key: key,
        Body: body,
        ContentType: mimeType,
        ContentLength: body.byteLength,
        ChecksumSHA256: Buffer.from(contentHash, "hex").toString("base64"),
      }),
    );
    return {
      objectVersion: created.VersionId ?? created.ETag ?? "unversioned",
    };
  }

  async deleteVersion(
    bucket: "quarantine" | "clean",
    key: string,
    versionId: string,
  ): Promise<void> {
    await this.internalClient.send(
      new DeleteObjectCommand({
        Bucket: this.bucket(bucket),
        Key: key,
        ...(versionId === "unversioned" || versionId.startsWith('"')
          ? {}
          : { VersionId: versionId }),
      }),
    );
  }

  private bucket(kind: "quarantine" | "clean"): string {
    return kind === "quarantine"
      ? this.config.quarantineBucket
      : this.config.cleanAssetBucket;
  }

  private client(audience: AssetUrlAudience): S3Client {
    return audience === AssetUrlAudience.PUBLIC
      ? this.publicClient
      : this.internalClient;
  }
}

export enum AssetUrlAudience {
  PUBLIC = "PUBLIC",
  SERVICE = "SERVICE",
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404
  );
}
