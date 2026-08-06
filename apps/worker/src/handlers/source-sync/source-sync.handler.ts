import { Inject, Injectable } from "@nestjs/common";
import { RetryableJobError } from "@sylis/background-jobs";
import { Prisma } from "@sylis/database";
import type { SylisDatabase } from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

import { WORKER_DATABASE } from "../../adapters/database/database.module";
import { ContentEncryptionService } from "../../adapters/encryption/content-encryption.service";
import { WorkerConfig } from "../../config/worker-config";
import type { ClaimedWorkerJob } from "../../runtime/job-runtime.service";
import { JobRuntimeService } from "../../runtime/job-runtime.service";
import type { WorkerHandler } from "../../runtime/worker-handler";

interface RedditPost {
  name?: string;
  id?: string;
  subreddit?: string;
  title?: string;
  selftext?: string;
  author_fullname?: string;
  permalink?: string;
  created_utc?: number;
  edited?: number | false;
  removed_by_category?: string | null;
}

interface RedditListing {
  data?: {
    after?: string | null;
    children?: Array<{
      data?: RedditPost;
    }>;
  };
}

@Injectable()
export class SourceSyncHandler implements WorkerHandler {
  readonly kind = "SOURCE_SYNC" as const;

  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: ContentEncryptionService,
    private readonly config: WorkerConfig,
    private readonly runtime: JobRuntimeService,
  ) {}

  async run(job: ClaimedWorkerJob): Promise<void> {
    const request = await this.database.sourceSynchronization.findUnique({
      where: { jobId: job.id },
    });
    if (!request || request.sourceKind !== "REDDIT") {
      throw new Error("SOURCE_SYNC_REQUEST_INVALID");
    }
    const token = await this.runtime.withHeartbeat(job, () =>
      this.accessToken(),
    );
    const cursors = request.cursor
      ? (JSON.parse(request.cursor) as Record<string, string>)
      : {};
    let processed = 0;
    for (const subreddit of this.config.redditSubreddits) {
      if (await this.runtime.cancellationRequested(job))
        throw new Error("JOB_CANCELLED");
      const listing = await this.fetchListing(
        token,
        subreddit,
        cursors[subreddit],
      );
      for (const child of listing.data?.children ?? []) {
        if (child.data) await this.projectPost(child.data, request.id);
        processed += 1;
      }
      const after = listing.data?.after;
      if (after) cursors[subreddit] = after;
      await this.database.sourceSynchronization.update({
        where: { id: request.id },
        data: { cursor: JSON.stringify(cursors) },
      });
      await this.runtime.checkpoint(job, {
        stage: "SYNCING",
        cursors,
        processed,
      });
      await this.runtime.report(job, {
        stage: "SYNCING",
        processed,
        total: null,
        message: subreddit,
      });
    }
    const retentionCutoff = new Date();
    await this.database.$transaction(async (transaction) => {
      const expired = await transaction.redditDocumentMetadata.findMany({
        where: { retentionUntil: { lte: retentionCutoff }, withdrawnAt: null },
        select: { documentId: true },
      });
      if (expired.length > 0) {
        await transaction.redditDocumentMetadata.updateMany({
          where: { documentId: { in: expired.map((row) => row.documentId) } },
          data: { withdrawnAt: retentionCutoff },
        });
        await transaction.readingDocument.updateMany({
          where: { id: { in: expired.map((row) => row.documentId) } },
          data: { status: "WITHDRAWN" },
        });
        await transaction.readingDocumentRevision.updateMany({
          where: {
            documentId: { in: expired.map((row) => row.documentId) },
            withdrawnAt: null,
          },
          data: { withdrawnAt: retentionCutoff },
        });
      }
      await transaction.sourceSynchronization.update({
        where: { id: request.id },
        data: {
          summary: { processed, subreddits: this.config.redditSubreddits },
        },
      });
    });
  }

  private async accessToken(): Promise<string> {
    if (!this.config.redditClientId || !this.config.redditClientSecret) {
      throw new Error("REDDIT_CONFIGURATION_MISSING");
    }
    const authorization = Buffer.from(
      `${this.config.redditClientId}:${this.config.redditClientSecret}`,
    ).toString("base64");
    const response = await this.redditFetch(
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": this.config.redditUserAgent,
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(20_000),
      },
      "REDDIT_AUTH",
    );
    const payload = (await response.json()) as { access_token?: string };
    if (!payload.access_token) throw new Error("REDDIT_AUTH_INVALID");
    return payload.access_token;
  }

  private async fetchListing(token: string, subreddit: string, after?: string) {
    const url = new URL(
      `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/new`,
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("raw_json", "1");
    if (after) url.searchParams.set("after", after);
    const response = await this.redditFetch(
      url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": this.config.redditUserAgent,
        },
        signal: AbortSignal.timeout(30_000),
      },
      "REDDIT_LISTING",
    );
    return (await response.json()) as RedditListing;
  }

  private async redditFetch(
    input: string | URL,
    init: RequestInit,
    errorPrefix: string,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      throw new RetryableJobError(`${errorPrefix}_NETWORK_ERROR`, {
        cause: error,
      });
    }
    if (!response.ok) {
      const message = `${errorPrefix}_HTTP_${response.status}`;
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableJobError(message);
      }
      throw new Error(message);
    }
    return response;
  }

  private async projectPost(post: RedditPost, synchronizationId: string) {
    const postId = post.name ?? (post.id ? `t3_${post.id}` : null);
    const { subreddit, title, permalink, created_utc: sourceCreatedUtc } = post;
    if (
      !postId ||
      !subreddit ||
      !title ||
      !permalink ||
      typeof sourceCreatedUtc !== "number" ||
      !Number.isFinite(sourceCreatedUtc) ||
      sourceCreatedUtc <= 0
    )
      return;
    const withdrawn =
      Boolean(post.removed_by_category) ||
      post.selftext === "[deleted]" ||
      post.selftext === "[removed]";
    const text = `${title}\n\n${withdrawn ? "" : (post.selftext ?? "")}`.trim();
    const contentHash = `sha256:${createHash("sha256").update(text).digest("hex")}`;
    await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`reddit-document:${postId}`}, 0)
        )
      `);
      let document = await transaction.readingDocument.findUnique({
        where: {
          sourceKind_externalKey: { sourceKind: "REDDIT", externalKey: postId },
        },
        include: { currentRevision: true },
      });
      if (!document) {
        document = await transaction.readingDocument.create({
          data: { sourceKind: "REDDIT", externalKey: postId, status: "DRAFT" },
          include: { currentRevision: true },
        });
        await transaction.redditDocumentMetadata.create({
          data: {
            documentId: document.id,
            subreddit,
            postId,
            authorHash: post.author_fullname
              ? `sha256:${createHash("sha256").update(post.author_fullname).digest("hex")}`
              : null,
            sourceUrl: `https://www.reddit.com${permalink}`,
            sourceCreatedAt: new Date(sourceCreatedUtc * 1_000),
            sourceEditedAt:
              typeof post.edited === "number"
                ? new Date(post.edited * 1_000)
                : null,
            retentionUntil: new Date(
              Date.now() + this.config.redditRetentionDays * 86_400_000,
            ),
          },
        });
      }
      const state = withdrawn
        ? "WITHDRAWN"
        : !document.currentRevision
          ? "CREATED"
          : document.currentRevision.contentHash === contentHash
            ? "UNCHANGED"
            : "EDITED";
      await transaction.redditSourceObservation.upsert({
        where: { synchronizationId_postId: { synchronizationId, postId } },
        create: {
          synchronizationId,
          documentId: document.id,
          postId,
          state,
          contentHash: withdrawn ? null : contentHash,
          sourceEditedAt:
            typeof post.edited === "number"
              ? new Date(post.edited * 1_000)
              : null,
        },
        update: {},
      });
      if (withdrawn) {
        await transaction.readingDocument.update({
          where: { id: document.id },
          data: { status: "WITHDRAWN" },
        });
        await transaction.redditDocumentMetadata.update({
          where: { documentId: document.id },
          data: { withdrawnAt: new Date() },
        });
        await transaction.readingDocumentRevision.updateMany({
          where: { documentId: document.id, withdrawnAt: null },
          data: { withdrawnAt: new Date() },
        });
        return;
      }
      if (document.currentRevision?.contentHash === contentHash) {
        await transaction.readingDocument.update({
          where: { id: document.id },
          data: { status: "PUBLISHED" },
        });
        await transaction.readingDocumentRevision.update({
          where: { id: document.currentRevision.id },
          data: { withdrawnAt: null },
        });
        await transaction.redditDocumentMetadata.update({
          where: { documentId: document.id },
          data: {
            sourceEditedAt:
              typeof post.edited === "number"
                ? new Date(post.edited * 1_000)
                : null,
            withdrawnAt: null,
            retentionUntil: new Date(
              Date.now() + this.config.redditRetentionDays * 86_400_000,
            ),
          },
        });
        return;
      }
      const revisionId = randomUUID();
      const revisionNo = (document.currentRevision?.revisionNo ?? 0) + 1;
      const envelope = this.encryption.encrypt(
        text,
        `reading-revision:${revisionId}`,
      );
      await transaction.readingDocumentRevision.create({
        data: {
          id: revisionId,
          documentId: document.id,
          revisionNo,
          languageTag: "en",
          title,
          contentCiphertext: envelope.ciphertext,
          keyVersion: envelope.keyVersion,
          contentHash,
          wordCount: text.split(/\s+/u).filter(Boolean).length,
          publishedAt: new Date(),
        },
      });
      await transaction.readingDocument.update({
        where: { id: document.id },
        data: { currentRevisionId: revisionId, status: "PUBLISHED" },
      });
      await transaction.redditDocumentMetadata.update({
        where: { documentId: document.id },
        data: {
          sourceEditedAt:
            typeof post.edited === "number"
              ? new Date(post.edited * 1_000)
              : null,
          withdrawnAt: null,
          retentionUntil: new Date(
            Date.now() + this.config.redditRetentionDays * 86_400_000,
          ),
        },
      });
    });
  }
}
