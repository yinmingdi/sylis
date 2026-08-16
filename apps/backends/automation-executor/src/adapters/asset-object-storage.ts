import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { AutomationExecutorConfig } from "../config/executor-config";

export enum AssetBucketKind {
  QUARANTINE = "QUARANTINE",
  CLEAN = "CLEAN",
}

export class AssetObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: AutomationExecutorConfig) {
    this.client = new S3Client({
      endpoint: config.objectStorageEndpoint,
      region: config.objectStorageRegion,
      forcePathStyle: config.objectStorageForcePathStyle,
      credentials: {
        accessKeyId: config.objectStorageAccessKeyId,
        secretAccessKey: config.objectStorageSecretAccessKey,
      },
    });
  }

  async deleteVersion(
    bucket: AssetBucketKind,
    key: string,
    versionId: string,
  ): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket:
          bucket === AssetBucketKind.QUARANTINE
            ? this.config.quarantineBucket
            : this.config.cleanAssetBucket,
        Key: key,
        ...(isVersionId(versionId) ? { VersionId: versionId } : {}),
      }),
    );
  }
}

function isVersionId(value: string): boolean {
  return value !== "unversioned" && !value.startsWith('"');
}
