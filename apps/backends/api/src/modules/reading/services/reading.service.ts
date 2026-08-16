import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  type AgentArticleDocument,
  type AgentArtifactRevisionSnapshot,
} from "@sylis/agent-contracts";
import {
  DocumentOriginKind,
  DocumentRetentionPolicy,
  DocumentRightsPolicy,
  Prisma,
  LexicalAnnotationTargetKind,
  ReadingActivityKind,
  ReadingDocumentStatus,
  ReadingDocumentVisibility,
  ReadingTargetReason,
  TextOffsetUnit,
} from "@sylis/database";
import type { PrismaTypes, SylisDatabase } from "@sylis/database";
import { stableUuid } from "@sylis/utils";
import { createHash } from "node:crypto";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import { ActiveReleaseService } from "../../lexicon/services/active-release.service";
import {
  LEXICAL_ANNOTATION_TARGET_INCLUDE,
  lexicalAnnotationTarget,
  lexicalTargetKey,
  LexicalTargetPresentationService,
} from "../../lexicon/services/lexical-target-presentation.service";
import type {
  RecordReadingActivityDto,
  ResolveSelectionDto,
  SaveReadingCollectionItemDto,
} from "../dto/reading.dto";

const READING_TARGET_POLICY_VERSION = "reading-targets/v1";

@Injectable()
export class ReadingService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: FieldEncryptionService,
    private readonly releases: ActiveReleaseService,
    private readonly targetPresentations: LexicalTargetPresentationService,
  ) {}

  async publishAgentArticle(
    actor: ActorContext,
    artifact: AgentArtifactRevisionSnapshot,
  ): Promise<{ documentId: string; revisionId: string }> {
    if (
      artifact.artifactKind !== AgentArtifactKind.ARTICLE ||
      artifact.schemaVersion !== AgentArtifactSchemaVersion.ARTICLE_V1 ||
      artifact.document.artifactKind !== AgentArtifactKind.ARTICLE ||
      artifact.document.schemaVersion !== AgentArtifactSchemaVersion.ARTICLE_V1
    ) {
      throw new UnprocessableEntityException(
        "Agent Artifact is not a publishable article",
      );
    }
    const article = artifact.document as AgentArticleDocument;
    const content = renderAgentArticle(article);
    if (!content) {
      throw new UnprocessableEntityException("Agent article has no content");
    }
    const sourceKey = `agent-artifact-revision:${artifact.revisionId}`;
    const documentId = stableUuid(`reading-document:${sourceKey}`);
    const revisionId = stableUuid(
      `reading-document-revision:${artifact.revisionId}:${artifact.contentHash}`,
    );
    const contentHash = sha256(content);
    const encrypted = this.encryption.encrypt(
      content,
      `reading-revision:${revisionId}`,
    );
    const publishedAt = new Date();

    return this.database.$transaction(async (transaction) => {
      const origin = await transaction.documentOrigin.upsert({
        where: {
          kind_sourceKey: { kind: DocumentOriginKind.AI_GENERATED, sourceKey },
        },
        create: {
          kind: DocumentOriginKind.AI_GENERATED,
          sourceKey,
          rightsPolicy: DocumentRightsPolicy.PRIVATE_OWNER,
          retentionPolicy: DocumentRetentionPolicy.OWNER_CONTROLLED,
        },
        update: {},
      });
      if (
        origin.rightsPolicy !== DocumentRightsPolicy.PRIVATE_OWNER ||
        origin.retentionPolicy !== DocumentRetentionPolicy.OWNER_CONTROLLED ||
        origin.retiredAt !== null
      ) {
        throw new ConflictException("AGENT_READING_ORIGIN_CONFLICT");
      }
      const document = await transaction.readingDocument.upsert({
        where: { id: documentId },
        create: {
          id: documentId,
          originId: origin.id,
          ownerUserId: actor.userId,
          externalKey: artifact.revisionId,
          status: ReadingDocumentStatus.DRAFT,
          visibility: ReadingDocumentVisibility.PRIVATE,
        },
        update: {},
      });
      if (
        document.originId !== origin.id ||
        document.ownerUserId !== actor.userId ||
        document.externalKey !== artifact.revisionId ||
        document.visibility !== ReadingDocumentVisibility.PRIVATE ||
        document.retiredAt !== null
      ) {
        throw new ConflictException("AGENT_READING_DOCUMENT_CONFLICT");
      }
      const revision = await transaction.readingDocumentRevision.upsert({
        where: { id: revisionId },
        create: {
          id: revisionId,
          documentId,
          revisionNo: 1,
          languageTag: article.languageTag,
          title: artifact.title,
          contentCiphertext: encrypted.ciphertext,
          keyVersion: encrypted.keyVersion,
          contentHash,
          wordCount: readingWordCount(content),
          createdAt: publishedAt,
          publishedAt,
        },
        update: {},
      });
      if (
        revision.documentId !== documentId ||
        revision.revisionNo !== 1 ||
        revision.languageTag !== article.languageTag ||
        revision.title !== artifact.title ||
        revision.contentHash !== contentHash ||
        revision.withdrawnAt !== null
      ) {
        throw new ConflictException("AGENT_READING_REVISION_CONFLICT");
      }
      if (
        document.currentRevisionId !== null &&
        document.currentRevisionId !== revisionId
      ) {
        throw new ConflictException("AGENT_READING_CURRENT_REVISION_CONFLICT");
      }
      await transaction.readingDocument.update({
        where: { id: documentId },
        data: {
          currentRevisionId: revisionId,
          status: ReadingDocumentStatus.PUBLISHED,
        },
      });
      return { documentId, revisionId };
    });
  }

  async document(actor: ActorContext, documentId: string) {
    const document = await this.database.readingDocument.findFirst({
      where: {
        id: documentId,
        ...this.accessibleDocumentWhere(actor),
      },
      include: {
        origin: true,
        currentRevision: true,
        redditMetadata: true,
      },
    });
    if (!document?.currentRevision) throw new NotFoundException();
    const revision = document.currentRevision;
    const { contentCiphertext, keyVersion, ...publicRevision } = revision;
    return {
      ...document,
      currentRevision: {
        ...publicRevision,
        content: this.verifiedRevisionContent({
          id: revision.id,
          contentCiphertext,
          keyVersion,
          contentHash: revision.contentHash,
        }),
      },
    };
  }

  async revision(actor: ActorContext, documentId: string, revisionId: string) {
    const revision = await this.database.readingDocumentRevision.findFirst({
      where: {
        id: revisionId,
        documentId,
        document: this.accessibleDocumentWhere(actor),
      },
    });
    if (!revision) throw new NotFoundException();
    const { contentCiphertext, keyVersion, ...metadata } = revision;
    return {
      ...metadata,
      content: this.verifiedRevisionContent({
        id: revision.id,
        contentCiphertext,
        keyVersion,
        contentHash: revision.contentHash,
      }),
    };
  }

  async annotations(actor: ActorContext, revisionId: string) {
    const revision = await this.accessibleRevision(actor, revisionId);
    const content = this.verifiedRevisionContent(revision);
    const annotations = await this.database.lexicalAnnotation.findMany({
      where: { revisionId },
      include: LEXICAL_ANNOTATION_TARGET_INCLUDE,
      orderBy: { startOffset: "asc" },
    });
    for (const annotation of annotations) {
      this.assertStoredSelector(annotation, revision.contentHash, content);
    }
    const targets = annotations.map(lexicalAnnotationTarget);
    const presentations = await this.targetPresentations.resolve(targets);
    return annotations.map((annotation, index) => {
      const target = targets[index]!;
      return {
        id: annotation.id,
        revisionId: annotation.revisionId,
        revisionContentHash: annotation.revisionContentHash,
        offsetUnit: annotation.offsetUnit,
        startOffset: annotation.startOffset,
        endOffset: annotation.endOffset,
        exactTextHash: annotation.exactTextHash,
        prefixLength: annotation.prefixLength,
        prefixTextHash: annotation.prefixTextHash,
        suffixLength: annotation.suffixLength,
        suffixTextHash: annotation.suffixTextHash,
        releaseId: annotation.releaseId,
        targetKind: annotation.targetKind,
        confidence: annotation.confidence,
        targetId: target.targetId,
        ...presentations.get(lexicalTargetKey(target)),
      };
    });
  }

  async targets(actor: ActorContext, revisionId: string) {
    await this.accessibleRevision(actor, revisionId);
    const rows = await this.database.readingTarget.findMany({
      where: { userId: actor.userId, revisionId },
      include: {
        annotation: { include: LEXICAL_ANNOTATION_TARGET_INCLUDE },
      },
      orderBy: { rank: "asc" },
    });
    const lexicalTargets = rows.map((row) =>
      lexicalAnnotationTarget(row.annotation),
    );
    const presentations =
      await this.targetPresentations.resolve(lexicalTargets);
    return rows.map((row, index) => {
      const target = lexicalTargets[index]!;
      return {
        id: row.id,
        revisionId: row.revisionId,
        releaseId: row.releaseId,
        annotationId: row.annotationId,
        objectiveRevisionId: row.objectiveRevisionId,
        policyVersion: row.policyVersion,
        rank: row.rank,
        reason: row.reason,
        targetKind: target.targetKind,
        targetId: target.targetId,
        ...presentations.get(lexicalTargetKey(target)),
      };
    });
  }

  async selectTargets(actor: ActorContext, revisionId: string) {
    await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`reading-targets:${actor.userId}:${revisionId}:${READING_TARGET_POLICY_VERSION}`}, 0)
        )::text
      `);
      const existingCount = await transaction.readingTarget.count({
        where: {
          userId: actor.userId,
          revisionId,
          policyVersion: READING_TARGET_POLICY_VERSION,
        },
      });
      if (existingCount > 0) return;

      const revision = await transaction.readingDocumentRevision.findFirst({
        where: {
          id: revisionId,
          document: this.accessibleDocumentWhere(actor),
        },
      });
      if (!revision) throw new NotFoundException();
      const content = this.verifiedRevisionContent(revision);
      const annotations = await transaction.lexicalAnnotation.findMany({
        where: {
          revisionId,
          targetKind: LexicalAnnotationTargetKind.OBJECTIVE,
        },
        include: { objectiveTarget: true },
        orderBy: { startOffset: "asc" },
      });
      const objectiveAnnotations = annotations.filter(
        (annotation) => annotation.objectiveTarget !== null,
      );
      if (objectiveAnnotations.length === 0) return;

      const memories = await transaction.userObjectiveMemoryState.findMany({
        where: {
          userId: actor.userId,
          OR: objectiveAnnotations.map((annotation) => ({
            releaseId: annotation.releaseId,
            objectiveRevisionId:
              annotation.objectiveTarget!.objectiveRevisionId,
          })),
        },
      });
      const memoryByObjective = new Map(
        memories.map((memory) => [
          `${memory.releaseId}:${memory.objectiveRevisionId}`,
          memory,
        ]),
      );
      const now = Date.now();
      const candidates = objectiveAnnotations
        .flatMap((annotation) => {
          const memory = memoryByObjective.get(
            `${annotation.releaseId}:${annotation.objectiveTarget!.objectiveRevisionId}`,
          );
          return memory ? [{ annotation, memory }] : [];
        })
        .sort((left, right) => {
          const leftOverdue = left.memory.dueAt.getTime() <= now ? 0 : 1;
          const rightOverdue = right.memory.dueAt.getTime() <= now ? 0 : 1;
          return (
            leftOverdue - rightOverdue ||
            retrievability(left.memory) - retrievability(right.memory) ||
            left.memory.reviewCount - right.memory.reviewCount ||
            left.annotation.startOffset - right.annotation.startOffset ||
            left.annotation.id.localeCompare(right.annotation.id)
          );
        });

      const selected: typeof candidates = [];
      const selectedSentences = new Set<number>();
      const limit = readingTargetLimit(revision.wordCount);
      for (const candidate of candidates) {
        const sentence = sentenceIndexAt(
          content,
          candidate.annotation.startOffset,
        );
        if (selectedSentences.has(sentence)) continue;
        selected.push(candidate);
        selectedSentences.add(sentence);
        if (selected.length === limit) break;
      }
      if (selected.length === 0) return;
      await transaction.readingTarget.createMany({
        data: selected.map(({ annotation, memory }, index) => ({
          userId: actor.userId,
          documentId: revision.documentId,
          revisionId,
          releaseId: annotation.releaseId,
          annotationId: annotation.id,
          objectiveRevisionId: annotation.objectiveTarget!.objectiveRevisionId,
          policyVersion: READING_TARGET_POLICY_VERSION,
          rank: index + 1,
          reason: readingTargetReason(memory, now),
        })),
      });
    });
    return this.targets(actor, revisionId);
  }

  async resolveSelection(
    actor: ActorContext,
    revisionId: string,
    input: ResolveSelectionDto,
  ) {
    const revision = await this.accessibleRevision(actor, revisionId);
    const content = this.verifiedRevisionContent(revision);
    this.assertRequestedSelection(input, revision.contentHash, content);
    const release = await this.releases.resolve();
    const normalized = input.text.normalize("NFC").trim();
    if (!normalized) {
      throw new UnprocessableEntityException(
        "Selection does not contain searchable text",
      );
    }
    const headwords = await this.database.headwordRevision.findMany({
      where: {
        releaseId: release.releaseId,
        normalizedText: { equals: normalized, mode: "insensitive" },
      },
      include: {
        entries: {
          include: {
            senses: { include: { definitions: true, translations: true } },
          },
        },
      },
      take: 10,
    });
    return { ...release, selectedText: input.text, matches: headwords };
  }

  async recordActivity(actor: ActorContext, input: RecordReadingActivityDto) {
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`reading-activity:${actor.userId}:${input.documentId}`}, 0)
        )::text
      `);
      const revision = await transaction.readingDocumentRevision.findFirst({
        where: {
          id: input.revisionId,
          documentId: input.documentId,
          document: this.accessibleDocumentWhere(actor),
        },
        select: { id: true, documentId: true },
      });
      if (!revision) throw new NotFoundException();
      this.assertActivityShape(input);
      const previous = await transaction.readingProgress.findUnique({
        where: {
          userId_documentId: {
            userId: actor.userId,
            documentId: input.documentId,
          },
        },
      });
      const now = new Date();
      const progress =
        input.kind === ReadingActivityKind.COMPLETE ? 1 : input.progress;
      const sameRevision = previous?.revisionId === input.revisionId;
      const eventVersion = (previous?.eventVersion ?? 0) + 1;
      const event = await transaction.readingActivity.create({
        data: {
          userId: actor.userId,
          documentId: input.documentId,
          revisionId: input.revisionId,
          kind: input.kind,
          position: input.position,
          progress,
          learnedWordCount: input.learnedWordCount,
          totalReadSeconds: input.totalReadSeconds,
          eventVersion,
          occurredAt: now,
        },
      });
      await transaction.readingProgress.upsert({
        where: {
          userId_documentId: {
            userId: actor.userId,
            documentId: input.documentId,
          },
        },
        create: {
          userId: actor.userId,
          documentId: input.documentId,
          revisionId: input.revisionId,
          progress: progress ?? 0,
          position: input.position ?? 0,
          learnedWordCount: input.learnedWordCount ?? 0,
          totalReadSeconds: input.totalReadSeconds,
          eventVersion,
          startedAt: now,
          lastReadAt: now,
          completedAt: input.kind === ReadingActivityKind.COMPLETE ? now : null,
        },
        update: {
          revisionId: input.revisionId,
          progress: sameRevision
            ? Math.max(previous!.progress, progress ?? 0)
            : (progress ?? 0),
          position: sameRevision
            ? Math.max(previous!.position, input.position ?? 0)
            : (input.position ?? 0),
          learnedWordCount: sameRevision
            ? Math.max(previous!.learnedWordCount, input.learnedWordCount ?? 0)
            : (input.learnedWordCount ?? 0),
          totalReadSeconds:
            sameRevision && previous!.totalReadSeconds !== null
              ? Math.max(
                  previous!.totalReadSeconds,
                  input.totalReadSeconds ?? 0,
                )
              : (input.totalReadSeconds ?? null),
          eventVersion,
          lastReadAt: now,
          completedAt:
            input.kind === ReadingActivityKind.COMPLETE
              ? sameRevision
                ? (previous!.completedAt ?? now)
                : now
              : sameRevision
                ? previous!.completedAt
                : null,
        },
      });
      return event;
    });
  }

  history(actor: ActorContext) {
    return this.database.readingProgress
      .findMany({
        where: {
          userId: actor.userId,
          revision: { document: this.accessibleDocumentWhere(actor) },
        },
        include: {
          revision: {
            include: {
              document: {
                select: {
                  id: true,
                  status: true,
                  visibility: true,
                  origin: true,
                  currentRevision: { select: { id: true, title: true } },
                  redditMetadata: true,
                },
              },
            },
          },
        },
        orderBy: { lastReadAt: "desc" },
        take: 100,
      })
      .then((rows) =>
        rows.map(({ revision, ...progress }) => ({
          ...progress,
          revisionId: revision.id,
          document: revision.document,
        })),
      );
  }

  library(actor: ActorContext) {
    return this.database.readingCollectionItem.findMany({
      where: {
        userId: actor.userId,
        collection: { identityKey: "library" },
        document: this.accessibleDocumentWhere(actor),
      },
      include: {
        collection: { select: { id: true, identityKey: true, title: true } },
        document: {
          select: {
            id: true,
            status: true,
            visibility: true,
            origin: true,
            currentRevision: { select: { id: true, title: true } },
            redditMetadata: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async save(actor: ActorContext, input: SaveReadingCollectionItemDto) {
    return this.database.$transaction(async (transaction) => {
      const document = await transaction.readingDocument.findFirst({
        where: {
          id: input.documentId,
          ...this.accessibleDocumentWhere(actor),
        },
        select: { id: true },
      });
      if (!document) throw new NotFoundException();
      const collection = await transaction.readingCollection.upsert({
        where: {
          userId_identityKey: {
            userId: actor.userId,
            identityKey: "library",
          },
        },
        create: {
          userId: actor.userId,
          identityKey: "library",
          title: "Saved reading",
        },
        update: {},
      });
      return transaction.readingCollectionItem.upsert({
        where: {
          userId_documentId: {
            userId: actor.userId,
            documentId: input.documentId,
          },
        },
        create: {
          userId: actor.userId,
          collectionId: collection.id,
          documentId: input.documentId,
          note: input.note,
          thumbnailUrl: input.thumbnailUrl,
          tags: input.tags ?? [],
        },
        update: {
          note: input.note,
          thumbnailUrl: input.thumbnailUrl,
          tags: input.tags,
        },
      });
    });
  }

  async unsave(actor: ActorContext, itemId: string) {
    const deleted = await this.database.readingCollectionItem.deleteMany({
      where: {
        id: itemId,
        userId: actor.userId,
        collection: { identityKey: "library" },
      },
    });
    if (deleted.count !== 1) throw new NotFoundException();
  }

  private async accessibleRevision(actor: ActorContext, revisionId: string) {
    const revision = await this.database.readingDocumentRevision.findFirst({
      where: {
        id: revisionId,
        document: this.accessibleDocumentWhere(actor),
      },
    });
    if (!revision) throw new NotFoundException();
    return revision;
  }

  private accessibleDocumentWhere(
    actor: ActorContext,
  ): PrismaTypes.ReadingDocumentWhereInput {
    return {
      OR: [
        { ownerUserId: actor.userId },
        {
          status: ReadingDocumentStatus.PUBLISHED,
          visibility: ReadingDocumentVisibility.PUBLIC,
        },
      ],
    };
  }

  private assertActivityShape(input: RecordReadingActivityDto): void {
    if (
      (input.kind === ReadingActivityKind.PROGRESS &&
        (input.progress === undefined || input.position === undefined)) ||
      (input.kind === ReadingActivityKind.LOOKUP &&
        input.position === undefined)
    ) {
      throw new UnprocessableEntityException(
        "Reading activity fields do not match the activity kind",
      );
    }
  }

  private verifiedRevisionContent(revision: {
    id: string;
    contentCiphertext: Uint8Array;
    keyVersion: string;
    contentHash: string;
  }): string {
    const content = this.encryption.decrypt(
      {
        ciphertext: revision.contentCiphertext,
        keyVersion: revision.keyVersion,
      },
      `reading-revision:${revision.id}`,
    );
    if (sha256(content) !== revision.contentHash) {
      throw new InternalServerErrorException(
        "Reading revision integrity check failed",
      );
    }
    return content;
  }

  private assertRequestedSelection(
    input: ResolveSelectionDto,
    revisionContentHash: string,
    content: string,
  ): void {
    if (
      input.revisionContentHash !== revisionContentHash ||
      input.offsetUnit !== TextOffsetUnit.UTF16_CODE_UNIT ||
      !validUtf16Range(content, input.startOffset, input.endOffset) ||
      content.slice(input.startOffset, input.endOffset) !== input.text
    ) {
      throw new UnprocessableEntityException(
        "Selection does not match the requested reading revision",
      );
    }
  }

  private assertStoredSelector(
    annotation: {
      revisionContentHash: string;
      offsetUnit: TextOffsetUnit;
      startOffset: number;
      endOffset: number;
      exactTextHash: string;
      prefixLength: number;
      prefixTextHash: string;
      suffixLength: number;
      suffixTextHash: string;
    },
    revisionContentHash: string,
    content: string,
  ): void {
    const prefixStart = annotation.startOffset - annotation.prefixLength;
    const suffixEnd = annotation.endOffset + annotation.suffixLength;
    const valid =
      annotation.revisionContentHash === revisionContentHash &&
      annotation.offsetUnit === TextOffsetUnit.UTF16_CODE_UNIT &&
      validUtf16Range(content, annotation.startOffset, annotation.endOffset) &&
      prefixStart >= 0 &&
      suffixEnd <= content.length &&
      isUtf16Boundary(content, prefixStart) &&
      isUtf16Boundary(content, suffixEnd) &&
      selectorHash(
        content.slice(annotation.startOffset, annotation.endOffset),
      ) === annotation.exactTextHash &&
      selectorHash(content.slice(prefixStart, annotation.startOffset)) ===
        annotation.prefixTextHash &&
      selectorHash(content.slice(annotation.endOffset, suffixEnd)) ===
        annotation.suffixTextHash;
    if (!valid) {
      throw new InternalServerErrorException(
        "Reading annotation selector integrity check failed",
      );
    }
  }
}

function validUtf16Range(content: string, start: number, end: number): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= content.length &&
    isUtf16Boundary(content, start) &&
    isUtf16Boundary(content, end)
  );
}

function renderAgentArticle(article: AgentArticleDocument): string {
  return article.sections
    .flatMap((section) => [
      ...(section.heading ? [section.heading.trim()] : []),
      ...section.paragraphs.map((paragraph) => paragraph.trim()),
    ])
    .filter(Boolean)
    .join("\n\n");
}

function readingWordCount(content: string): number {
  return (
    content.match(/[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  );
}

function readingTargetLimit(wordCount: number): number {
  if (wordCount <= 300) return 3;
  if (wordCount <= 1_000) return 5;
  return 8;
}

function sentenceIndexAt(content: string, offset: number): number {
  let sentence = 0;
  for (let index = 0; index < Math.min(offset, content.length); index += 1) {
    if (/[.!?\n\u3002\uff01\uff1f]/u.test(content[index]!)) sentence += 1;
  }
  return sentence;
}

function retrievability(memory: {
  elapsedDays: number;
  stability: number;
}): number {
  return Math.exp(
    -Math.max(memory.elapsedDays, 0) / Math.max(memory.stability, 0.1),
  );
}

function readingTargetReason(
  memory: { dueAt: Date; reviewCount: number },
  now: number,
): ReadingTargetReason {
  if (memory.dueAt.getTime() <= now) return ReadingTargetReason.OVERDUE;
  if (memory.reviewCount === 0) return ReadingTargetReason.COVERAGE_GAP;
  return ReadingTargetReason.LOW_RETRIEVABILITY;
}

function isUtf16Boundary(content: string, offset: number): boolean {
  if (offset <= 0 || offset >= content.length) return true;
  const previous = content.charCodeAt(offset - 1);
  const current = content.charCodeAt(offset);
  return !(
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    current >= 0xdc00 &&
    current <= 0xdfff
  );
}

function selectorHash(value: string): string {
  return sha256(value.normalize("NFC"));
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
