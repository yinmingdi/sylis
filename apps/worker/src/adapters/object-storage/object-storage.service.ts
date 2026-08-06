import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";

import { WorkerConfig } from "../../config/worker-config";

@Injectable()
export class ObjectStorageService {
  constructor(private readonly config: WorkerConfig) {}

  async put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<string> {
    const {
      objectStorageBucket: bucket,
      objectStorageAccessKeyId: accessKeyId,
      objectStorageSecretAccessKey: secretAccessKey,
    } = this.config;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error("OBJECT_STORAGE_CONFIGURATION_MISSING");
    }
    const client = new S3Client({
      endpoint: this.config.objectStorageEndpoint,
      region: this.config.objectStorageRegion,
      forcePathStyle: Boolean(this.config.objectStorageEndpoint),
      credentials: { accessKeyId, secretAccessKey },
    });
    const objectKey = `${this.config.objectStoragePrefix.replace(/\/$/u, "")}/${key}`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        ContentDisposition: 'attachment; filename="sylis-data-export.json"',
        ServerSideEncryption: "AES256",
      }),
    );
    const downloadUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      { expiresIn: 24 * 60 * 60 },
    );
    client.destroy();
    return downloadUrl;
  }
}
