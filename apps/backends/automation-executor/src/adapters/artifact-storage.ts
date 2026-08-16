import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AuditArchiveEncryptionAlgorithm } from "@sylis/job-contracts";
import { canonicalJson } from "@sylis/utils";
import {
  createCipheriv,
  createHash,
  createHmac,
  type CipherGCM,
} from "node:crypto";
import type { Readable } from "node:stream";
import { Readable as NodeReadable } from "node:stream";
import { Transform } from "node:stream";

import type { AutomationExecutorConfig } from "../config/executor-config";

const DATA_EXPORT_TTL_SECONDS = 24 * 60 * 60;

enum ArtifactKeyPrefix {
  AUDIT_ARCHIVE = "audit-archives/sha256",
  AUDIT_EXPORT = "audit-exports",
  USER_DATA_EXPORT = "user-data-exports",
}

export interface StoredArtifact {
  artifactUri: string;
  expiresAt: Date;
}

export interface StoredAuditArtifact extends StoredArtifact {
  contentHash: string;
}

export interface StoredAuditArchive {
  objectRef: string;
  contentHash: string;
  encryptionVersion: string;
}

export class ArtifactStorage {
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;

  constructor(private readonly config: AutomationExecutorConfig) {
    this.internalClient = this.client(config.objectStorageEndpoint);
    this.publicClient = this.client(config.objectStoragePublicEndpoint);
  }

  async putDataExport(
    requestId: string,
    value: Uint8Array,
  ): Promise<StoredArtifact> {
    const key = `${ArtifactKeyPrefix.USER_DATA_EXPORT}/${requestId}.json`;
    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.config.exportBucket,
        Key: key,
        Body: value,
        ContentType: "application/json",
        ContentDisposition: `attachment; filename="sylis-export-${requestId}.json"`,
      }),
    );
    const artifactUri = await getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.config.exportBucket,
        Key: key,
      }),
      { expiresIn: DATA_EXPORT_TTL_SECONDS },
    );
    return {
      artifactUri,
      expiresAt: new Date(Date.now() + DATA_EXPORT_TTL_SECONDS * 1_000),
    };
  }

  async deleteDataExport(requestId: string): Promise<void> {
    await this.internalClient.send(
      new DeleteObjectCommand({
        Bucket: this.config.exportBucket,
        Key: `${ArtifactKeyPrefix.USER_DATA_EXPORT}/${requestId}.json`,
      }),
    );
  }

  async putAuditExport(
    exportId: string,
    value: Readable,
  ): Promise<StoredAuditArtifact> {
    const key = `${ArtifactKeyPrefix.AUDIT_EXPORT}/${exportId}.ndjson.zst`;
    const hash = createHash("sha256");
    const hashingStream = new Transform({
      transform(chunk: Buffer | string, encoding, callback) {
        hash.update(chunk);
        callback(
          null,
          typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk,
        );
      },
    });
    await new Upload({
      client: this.internalClient,
      params: {
        Bucket: this.config.exportBucket,
        Key: key,
        Body: value.pipe(hashingStream),
        ContentType: "application/zstd",
        ContentDisposition: `attachment; filename="sylis-audit-${exportId}.ndjson.zst"`,
      },
    }).done();
    const artifactUri = await getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.config.exportBucket,
        Key: key,
      }),
      { expiresIn: DATA_EXPORT_TTL_SECONDS },
    );
    return {
      artifactUri,
      contentHash: `sha256:${hash.digest("hex")}`,
      expiresAt: new Date(Date.now() + DATA_EXPORT_TTL_SECONDS * 1_000),
    };
  }

  async putAuditArchive(
    archiveId: string,
    compressed: Readable,
    contentHash: string,
  ): Promise<StoredAuditArchive> {
    const digest = sha256Digest(contentHash);
    const key = `${ArtifactKeyPrefix.AUDIT_ARCHIVE}/${digest}/${archiveId}.ndjson.zst.aes256gcm`;
    const encryptionVersion = this.config.auditArchiveEncryptionKeyVersion;
    const encryptionKey = Buffer.from(this.config.auditArchiveEncryptionKey);
    const nonce = createHmac("sha256", encryptionKey)
      .update(canonicalJson({ archiveId, contentHash, encryptionVersion }))
      .digest()
      .subarray(0, 12);
    const aad = Buffer.from(
      canonicalJson({
        archiveId,
        contentHash,
        encryptionVersion,
        schemaVersion: "sylis-audit-archive-envelope/v1",
      }),
    );
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
    cipher.setAAD(aad);
    const header = Buffer.from(
      `${canonicalJson({
        aad: aad.toString("base64"),
        algorithm: AuditArchiveEncryptionAlgorithm.AES_256_GCM,
        authTagBytes: 16,
        nonce: nonce.toString("base64"),
        schemaVersion: "sylis-audit-archive-envelope/v1",
      })}\n`,
    );
    const encrypted = NodeReadable.from(
      encryptArchive(compressed, cipher, header),
    );
    try {
      await new Upload({
        client: this.internalClient,
        params: {
          Bucket: this.config.auditArchiveBucket,
          Key: key,
          Body: encrypted,
          ContentType: "application/vnd.sylis.audit-archive",
          Metadata: {
            "content-sha256": digest,
            "encryption-key-version": encryptionVersion,
          },
        },
      }).done();
    } finally {
      encryptionKey.fill(0);
    }
    return { objectRef: key, contentHash, encryptionVersion };
  }

  async deleteAuditArchive(
    objectRef: string,
    contentHash: string,
  ): Promise<void> {
    const archiveId = /\/([0-9a-f-]{36})\.ndjson\.zst\.aes256gcm$/i.exec(
      objectRef,
    )?.[1];
    const expected = archiveId
      ? `${ArtifactKeyPrefix.AUDIT_ARCHIVE}/${sha256Digest(contentHash)}/${archiveId}.ndjson.zst.aes256gcm`
      : null;
    if (objectRef !== expected) {
      throw new Error("AUDIT_ARCHIVE_OBJECT_REF_MISMATCH");
    }
    await this.internalClient.send(
      new DeleteObjectCommand({
        Bucket: this.config.auditArchiveBucket,
        Key: objectRef,
      }),
    );
  }

  private client(endpoint: string): S3Client {
    return new S3Client({
      endpoint,
      region: this.config.objectStorageRegion,
      forcePathStyle: this.config.objectStorageForcePathStyle,
      credentials: {
        accessKeyId: this.config.objectStorageAccessKeyId,
        secretAccessKey: this.config.objectStorageSecretAccessKey,
      },
    });
  }
}

async function* encryptArchive(
  compressed: Readable,
  cipher: CipherGCM,
  header: Buffer,
): AsyncGenerator<Buffer> {
  yield header;
  for await (const chunk of compressed) {
    const encrypted = cipher.update(Buffer.from(chunk));
    if (encrypted.byteLength > 0) yield encrypted;
  }
  const final = cipher.final();
  if (final.byteLength > 0) yield final;
  yield cipher.getAuthTag();
}

function sha256Digest(value: string): string {
  const match = /^sha256:([0-9a-f]{64})$/.exec(value);
  if (!match) throw new Error("AUDIT_ARCHIVE_CONTENT_HASH_INVALID");
  return match[1]!;
}
