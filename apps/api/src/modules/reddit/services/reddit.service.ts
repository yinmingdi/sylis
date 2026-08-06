import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";

import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";

@Injectable()
export class RedditService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: FieldEncryptionService,
  ) {}

  feed(subreddit?: string) {
    return this.database.redditDocumentMetadata.findMany({
      where: {
        subreddit: subreddit
          ? { equals: subreddit, mode: "insensitive" }
          : undefined,
        withdrawnAt: null,
        document: { status: "PUBLISHED" },
      },
      include: {
        document: {
          select: {
            id: true,
            currentRevision: {
              select: {
                id: true,
                title: true,
                wordCount: true,
                publishedAt: true,
              },
            },
          },
        },
      },
      orderBy: { sourceCreatedAt: "desc" },
      take: 50,
    });
  }

  async post(externalId: string) {
    const post = await this.database.redditDocumentMetadata.findUnique({
      where: { postId: externalId },
      include: {
        document: { include: { currentRevision: true } },
      },
    });
    if (!post || post.withdrawnAt || post.document.status !== "PUBLISHED")
      throw new NotFoundException();
    const revision = post.document.currentRevision;
    return {
      ...post,
      document: {
        ...post.document,
        currentRevision: revision ? this.serializeRevision(revision) : null,
      },
    };
  }

  private serializeRevision<
    T extends {
      id: string;
      contentCiphertext: Uint8Array;
      keyVersion: string;
    },
  >(revision: T) {
    const { contentCiphertext, keyVersion, ...publicRevision } = revision;
    return {
      ...publicRevision,
      content: this.encryption.decrypt(
        { ciphertext: contentCiphertext, keyVersion },
        `reading-revision:${revision.id}`,
      ),
    };
  }
}
