import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@sylis/database";
import type { SylisDatabase } from "@sylis/database";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import { ActiveReleaseService } from "../../lexicon/services/active-release.service";
import {
  lexicalTargetKey,
  LexicalTargetPresentationService,
} from "../../lexicon/services/lexical-target-presentation.service";
import type {
  RecordReadingActivityDto,
  ResolveSelectionDto,
  SaveReadingDto,
} from "../dto/reading.dto";

@Injectable()
export class ReadingService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: FieldEncryptionService,
    private readonly releases: ActiveReleaseService,
    private readonly targetPresentations: LexicalTargetPresentationService,
  ) {}

  async document(actor: ActorContext, documentId: string) {
    const document = await this.database.readingDocument.findFirst({
      where: {
        id: documentId,
        OR: [{ ownerUserId: actor.userId }, { status: "PUBLISHED" }],
      },
      include: { currentRevision: true, redditMetadata: true },
    });
    if (!document?.currentRevision) throw new NotFoundException();
    const revision = document.currentRevision;
    const { contentCiphertext, keyVersion, ...publicRevision } = revision;
    return {
      ...document,
      currentRevision: {
        ...publicRevision,
        content: this.encryption.decrypt(
          { ciphertext: contentCiphertext, keyVersion },
          `reading-revision:${revision.id}`,
        ),
      },
    };
  }

  async annotations(actor: ActorContext, revisionId: string) {
    const revision = await this.database.readingDocumentRevision.findFirst({
      where: {
        id: revisionId,
        document: {
          OR: [{ ownerUserId: actor.userId }, { status: "PUBLISHED" }],
        },
      },
    });
    if (!revision) throw new NotFoundException();
    const annotations = await this.database.lexicalAnnotation.findMany({
      where: { revisionId },
      orderBy: { startOffset: "asc" },
    });
    const presentations = await this.targetPresentations.resolve(annotations);
    return annotations.map((annotation) => ({
      ...annotation,
      ...presentations.get(lexicalTargetKey(annotation)),
    }));
  }

  async resolveSelection(
    actor: ActorContext,
    revisionId: string,
    input: ResolveSelectionDto,
  ) {
    await this.annotations(actor, revisionId);
    const release = await this.releases.resolve();
    const normalized = input.text.normalize("NFC").trim();
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
        )
      `);
      const document = await transaction.readingDocument.findFirst({
        where: {
          id: input.documentId,
          OR: [{ ownerUserId: actor.userId }, { status: "PUBLISHED" }],
          revisions: input.revisionId
            ? { some: { id: input.revisionId } }
            : undefined,
        },
        select: { id: true },
      });
      if (!document) throw new NotFoundException();
      const now = new Date();
      const progress = input.eventKind === "COMPLETE" ? 1 : input.progress;
      const event = await transaction.readingActivityEvent.create({
        data: {
          userId: actor.userId,
          documentId: input.documentId,
          revisionId: input.revisionId,
          eventKind: input.eventKind,
          offset: input.offset,
          progress,
        },
      });
      await transaction.readingActivity.upsert({
        where: {
          userId_documentId: {
            userId: actor.userId,
            documentId: input.documentId,
          },
        },
        create: {
          userId: actor.userId,
          documentId: input.documentId,
          progress: progress ?? 0,
          lastOffset: input.offset ?? 0,
          completedAt: input.eventKind === "COMPLETE" ? now : null,
        },
        update: {
          progress,
          lastOffset: input.offset,
          lastReadAt: now,
          completedAt: input.eventKind === "COMPLETE" ? now : undefined,
        },
      });
      return event;
    });
  }

  history(actor: ActorContext) {
    return this.database.readingActivity.findMany({
      where: {
        userId: actor.userId,
        document: {
          OR: [{ ownerUserId: actor.userId }, { status: "PUBLISHED" }],
        },
      },
      include: {
        document: {
          select: {
            id: true,
            sourceKind: true,
            status: true,
            currentRevision: { select: { title: true } },
          },
        },
      },
      orderBy: { lastReadAt: "desc" },
      take: 100,
    });
  }

  saved(actor: ActorContext) {
    return this.database.savedReading.findMany({
      where: {
        userId: actor.userId,
        OR: [
          { documentId: null },
          {
            document: {
              OR: [{ ownerUserId: actor.userId }, { status: "PUBLISHED" }],
            },
          },
        ],
      },
      include: {
        document: {
          select: {
            id: true,
            sourceKind: true,
            status: true,
            currentRevision: { select: { title: true } },
          },
        },
      },
      orderBy: { savedAt: "desc" },
    });
  }

  async save(actor: ActorContext, input: SaveReadingDto) {
    const documentMode = Boolean(input.documentId);
    const targetMode = Boolean(
      input.releaseId && input.targetKind && input.targetId,
    );
    if (documentMode === targetMode) {
      throw new UnprocessableEntityException(
        "Exactly one saved target is required",
      );
    }
    if (input.documentId) {
      const document = await this.database.readingDocument.findFirst({
        where: {
          id: input.documentId,
          OR: [{ ownerUserId: actor.userId }, { status: "PUBLISHED" }],
        },
      });
      if (!document) throw new NotFoundException();
      return this.database.savedReading.upsert({
        where: {
          userId_documentId: {
            userId: actor.userId,
            documentId: input.documentId,
          },
        },
        create: { userId: actor.userId, documentId: input.documentId },
        update: {},
      });
    }
    const release = await this.releases.resolve();
    if (input.releaseId !== release.releaseId) {
      throw new UnprocessableEntityException(
        "Saved lexical target is not in the active release",
      );
    }
    await this.assertLexicalTarget(
      release.releaseId,
      input.targetKind!,
      input.targetId!,
    );
    return this.database.savedReading.upsert({
      where: {
        userId_releaseId_targetKind_targetId: {
          userId: actor.userId,
          releaseId: input.releaseId!,
          targetKind: input.targetKind!,
          targetId: input.targetId!,
        },
      },
      create: { userId: actor.userId, ...input },
      update: {},
    });
  }

  async unsave(actor: ActorContext, itemId: string) {
    const deleted = await this.database.savedReading.deleteMany({
      where: { id: itemId, userId: actor.userId },
    });
    if (deleted.count !== 1) throw new NotFoundException();
  }

  private async assertLexicalTarget(
    releaseId: string,
    targetKind: string,
    targetId: string,
  ): Promise<void> {
    const count =
      targetKind === "HEADWORD"
        ? await this.database.headwordRevision.count({
            where: { releaseId, headwordId: targetId },
          })
        : targetKind === "ENTRY"
          ? await this.database.lexicalEntryRevision.count({
              where: { releaseId, entryId: targetId },
            })
          : targetKind === "SENSE"
            ? await this.database.lexicalSenseRevision.count({
                where: { releaseId, senseId: targetId },
              })
            : await this.database.collocation.count({
                where: { releaseId, id: targetId },
              });
    if (count !== 1) {
      throw new UnprocessableEntityException(
        "Saved lexical target is unavailable",
      );
    }
  }
}
