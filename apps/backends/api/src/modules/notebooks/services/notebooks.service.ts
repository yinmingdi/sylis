import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  CollectedLexicalItemRevisionSource,
  Prisma,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash, randomUUID } from "node:crypto";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { LexicalTargetKind } from "../../lexicon/lexical-target-kind";
import { ActiveReleaseService } from "../../lexicon/services/active-release.service";
import {
  lexicalTargetKey,
  LexicalTargetPresentationService,
} from "../../lexicon/services/lexical-target-presentation.service";
import type {
  AddNotebookItemDto,
  CreateNotebookDto,
  LexicalTargetDto,
  UpdateNotebookItemDto,
  UpdateNotebookDto,
} from "../dto/notebooks.dto";

const currentRevisionInclude = {
  currentRevision: {
    include: {
      headwordTarget: true,
      entryTarget: true,
      senseTarget: true,
      collocationTarget: true,
    },
  },
} satisfies PrismaTypes.CollectedLexicalItemInclude;

type CollectedItemWithRevision = PrismaTypes.CollectedLexicalItemGetPayload<{
  include: typeof currentRevisionInclude;
}>;

const normalizeName = (name: string): string =>
  name.normalize("NFC").trim().replace(/\s+/g, " ");

@Injectable()
export class NotebooksService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly releases: ActiveReleaseService,
    private readonly targetPresentations: LexicalTargetPresentationService,
  ) {}

  list(actor: ActorContext) {
    return this.database.notebook.findMany({
      where: { userId: actor.userId, retiredAt: null },
      include: {
        _count: {
          select: { items: { where: { retiredAt: null } } },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    });
  }

  create(actor: ActorContext, input: CreateNotebookDto) {
    return this.database.notebook.create({
      data: {
        userId: actor.userId,
        name: normalizeName(input.name),
        description: input.description,
      },
    });
  }

  async get(actor: ActorContext, id: string) {
    const notebook = await this.database.notebook.findFirst({
      where: { id, userId: actor.userId, retiredAt: null },
      include: {
        _count: { select: { items: { where: { retiredAt: null } } } },
      },
    });
    if (!notebook) throw new NotFoundException();
    return notebook;
  }

  async update(actor: ActorContext, id: string, input: UpdateNotebookDto) {
    return this.database.$transaction(async (transaction) => {
      await this.lockNotebook(transaction, actor.userId, id);
      return transaction.notebook.update({
        where: { id },
        data: {
          name: normalizeName(input.name),
          description: input.description,
        },
      });
    });
  }

  async remove(actor: ActorContext, id: string) {
    await this.database.$transaction(async (transaction) => {
      await this.lockNotebook(transaction, actor.userId, id);
      const retiredAt = new Date();
      await transaction.collectedLexicalItem.updateMany({
        where: { notebookId: id, retiredAt: null },
        data: { retiredAt },
      });
      await transaction.notebook.update({
        where: { id },
        data: { retiredAt },
      });
    });
  }

  async items(actor: ActorContext, notebookId: string) {
    const [, release] = await Promise.all([
      this.get(actor, notebookId),
      this.releases.resolve(),
    ]);
    const items = await this.database.collectedLexicalItem.findMany({
      where: { notebookId, retiredAt: null },
      orderBy: { position: "asc" },
      include: currentRevisionInclude,
    });
    const references = items.map((item) => ({
      releaseId: release.releaseId,
      ...this.revisionTarget(item),
    }));
    const presentations = await this.targetPresentations.resolve(references);
    return items.map((item) => ({
      ...this.serializeItem(item),
      ...presentations.get(
        lexicalTargetKey({
          releaseId: release.releaseId,
          ...this.revisionTarget(item),
        }),
      ),
    }));
  }

  async addItem(
    actor: ActorContext,
    notebookId: string,
    input: AddNotebookItemDto,
    source: CollectedLexicalItemRevisionSource = CollectedLexicalItemRevisionSource.USER,
  ) {
    const release = await this.releases.resolve();
    const item = await this.database.$transaction(async (transaction) => {
      await this.lockNotebook(transaction, actor.userId, notebookId);
      await this.assertTarget(transaction, release.releaseId, input.target);
      const existing = await transaction.collectedLexicalItem.findFirst({
        where: {
          notebookId,
          retiredAt: null,
          ...currentTargetWhere(input.target),
        },
        include: currentRevisionInclude,
      });
      if (existing) return existing;
      const last = await transaction.collectedLexicalItem.findFirst({
        where: { notebookId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const created = await transaction.collectedLexicalItem.create({
        data: {
          id: randomUUID(),
          notebookId,
          position: (last?.position ?? -1) + 1,
        },
      });
      const revision = await this.createRevision(transaction, {
        itemId: created.id,
        revisionNo: 1,
        releaseId: release.releaseId,
        target: input.target,
        note: normalizedNote(input.note),
        tags: normalizedTags(input.tags),
        source,
        createdBy: actor.userId,
      });
      return transaction.collectedLexicalItem.update({
        where: { id: created.id },
        data: { currentRevisionId: revision.id },
        include: currentRevisionInclude,
      });
    });
    return this.serializeItem(item);
  }

  async updateItem(
    actor: ActorContext,
    notebookId: string,
    itemId: string,
    input: UpdateNotebookItemDto,
  ) {
    const updated = await this.database.$transaction(async (transaction) => {
      await this.lockNotebook(transaction, actor.userId, notebookId);
      const items = await transaction.collectedLexicalItem.findMany({
        where: { notebookId, retiredAt: null },
        orderBy: { position: "asc" },
        include: currentRevisionInclude,
      });
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) throw new NotFoundException();
      if (input.position !== undefined && items.length > 1) {
        const reordered = items.filter((candidate) => candidate.id !== itemId);
        reordered.splice(Math.min(input.position, reordered.length), 0, item);
        const retired = await transaction.collectedLexicalItem.findMany({
          where: { notebookId, retiredAt: { not: null } },
          orderBy: { position: "asc" },
          select: { id: true },
        });
        await this.writePositions(transaction, notebookId, [
          ...reordered.map((candidate) => candidate.id),
          ...retired.map(({ id }) => id),
        ]);
      }
      const revision = requiredRevision(item);
      const note =
        input.note === undefined ? revision.note : normalizedNote(input.note);
      const tags =
        input.tags === undefined ? revision.tags : normalizedTags(input.tags);
      if (
        note !== revision.note ||
        canonicalJson(tags) !== canonicalJson(revision.tags)
      ) {
        const next = await this.createRevision(transaction, {
          itemId: item.id,
          revisionNo: revision.revisionNo + 1,
          releaseId: revision.collocationTarget?.releaseId,
          target: this.revisionTargetDto(item),
          note,
          tags,
          source: CollectedLexicalItemRevisionSource.USER,
          createdBy: actor.userId,
        });
        await transaction.collectedLexicalItem.update({
          where: { id: item.id },
          data: { currentRevisionId: next.id },
        });
      }
      return transaction.collectedLexicalItem.findUniqueOrThrow({
        where: { id: item.id },
        include: currentRevisionInclude,
      });
    });
    return this.serializeItem(updated);
  }

  async removeItem(actor: ActorContext, notebookId: string, itemId: string) {
    await this.database.$transaction(async (transaction) => {
      await this.lockNotebook(transaction, actor.userId, notebookId);
      const retired = await transaction.collectedLexicalItem.updateMany({
        where: { id: itemId, notebookId, retiredAt: null },
        data: { retiredAt: new Date() },
      });
      if (retired.count !== 1) throw new NotFoundException();
      const remaining = await transaction.collectedLexicalItem.findMany({
        where: { notebookId, retiredAt: null },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      const retiredItems = await transaction.collectedLexicalItem.findMany({
        where: { notebookId, retiredAt: { not: null } },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      await this.writePositions(
        transaction,
        notebookId,
        [...remaining, ...retiredItems].map((item) => item.id),
      );
    });
  }

  private async lockNotebook(
    transaction: SylisTransaction,
    userId: string,
    notebookId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM "Notebook"
      WHERE id = ${notebookId}::uuid
        AND "userId" = ${userId}::uuid
        AND "retiredAt" IS NULL
      FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException();
  }

  private async writePositions(
    transaction: SylisTransaction,
    notebookId: string,
    itemIds: string[],
  ): Promise<void> {
    if (itemIds.length === 0) return;
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "CollectedLexicalItem"
      SET position = -position - 1
      WHERE "notebookId" = ${notebookId}::uuid
    `);
    for (const [position, id] of itemIds.entries()) {
      await transaction.collectedLexicalItem.update({
        where: { id },
        data: { position },
      });
    }
  }

  private serializeItem(item: CollectedItemWithRevision) {
    const revision = requiredRevision(item);
    const target = this.revisionTarget(item);
    return {
      id: item.id,
      notebookId: item.notebookId,
      revisionId: revision.id,
      position: item.position,
      addedAt: item.addedAt,
      targetKind: target.targetKind,
      targetId: target.targetId,
      source: revision.source,
      context: revision.context,
      note: revision.note,
      tags: revision.tags,
      updatedAt: revision.createdAt,
    };
  }

  private revisionTarget(item: CollectedItemWithRevision) {
    const revision = requiredRevision(item);
    if (revision.headwordTarget) {
      return {
        targetKind: LexicalTargetKind.HEADWORD,
        targetId: revision.headwordTarget.headwordId,
      } as const;
    }
    if (revision.entryTarget) {
      return {
        targetKind: LexicalTargetKind.ENTRY,
        targetId: revision.entryTarget.entryId,
      } as const;
    }
    if (revision.senseTarget) {
      return {
        targetKind: LexicalTargetKind.SENSE,
        targetId: revision.senseTarget.senseId,
      } as const;
    }
    if (revision.collocationTarget) {
      return {
        targetKind: LexicalTargetKind.COLLOCATION,
        targetId: revision.collocationTarget.collocationId,
      } as const;
    }
    throw new Error("COLLECTED_ITEM_REVISION_TARGET_MISSING");
  }

  private revisionTargetDto(item: CollectedItemWithRevision): LexicalTargetDto {
    const target = this.revisionTarget(item);
    return { kind: target.targetKind, id: target.targetId };
  }

  private async createRevision(
    transaction: SylisTransaction,
    input: {
      itemId: string;
      revisionNo: number;
      releaseId?: string;
      target: LexicalTargetDto;
      note: string | null;
      tags: string[];
      source: CollectedLexicalItemRevisionSource;
      createdBy: string;
    },
  ) {
    const revision = await transaction.collectedLexicalItemRevision.create({
      data: {
        collectedItemId: input.itemId,
        revisionNo: input.revisionNo,
        source: input.source,
        context: null,
        note: input.note,
        tags: input.tags,
        contentHash: revisionContentHash(input.target, input.note, input.tags),
        createdBy: input.createdBy,
      },
    });
    await this.createRevisionTarget(
      transaction,
      revision.id,
      input.releaseId,
      input.target,
    );
    return revision;
  }

  private createRevisionTarget(
    transaction: SylisTransaction,
    revisionId: string,
    releaseId: string | undefined,
    target: LexicalTargetDto,
  ) {
    switch (target.kind) {
      case LexicalTargetKind.HEADWORD:
        return transaction.collectedRevisionHeadwordTarget.create({
          data: { revisionId, headwordId: target.id },
        });
      case LexicalTargetKind.ENTRY:
        return transaction.collectedRevisionEntryTarget.create({
          data: { revisionId, entryId: target.id },
        });
      case LexicalTargetKind.SENSE:
        return transaction.collectedRevisionSenseTarget.create({
          data: { revisionId, senseId: target.id },
        });
      case LexicalTargetKind.COLLOCATION:
        if (!releaseId) {
          throw new Error("COLLOCATION_RELEASE_ID_REQUIRED");
        }
        return transaction.collectedRevisionCollocationTarget.create({
          data: { revisionId, releaseId, collocationId: target.id },
        });
    }
  }

  private async assertTarget(
    transaction: SylisTransaction,
    releaseId: string,
    target: LexicalTargetDto,
  ): Promise<void> {
    const count =
      target.kind === LexicalTargetKind.HEADWORD
        ? await transaction.headwordRevision.count({
            where: { releaseId, headwordId: target.id },
          })
        : target.kind === LexicalTargetKind.ENTRY
          ? await transaction.lexicalEntryRevision.count({
              where: { releaseId, entryId: target.id },
            })
          : target.kind === LexicalTargetKind.SENSE
            ? await transaction.lexicalSenseRevision.count({
                where: { releaseId, senseId: target.id },
              })
            : await transaction.collocation.count({
                where: { releaseId, id: target.id },
              });
    if (count !== 1)
      throw new UnprocessableEntityException(
        "Lexical target is unavailable in the active release",
      );
  }
}

function requiredRevision(item: CollectedItemWithRevision) {
  if (!item.currentRevision)
    throw new Error("COLLECTED_ITEM_CURRENT_REVISION_MISSING");
  return item.currentRevision;
}

function currentTargetWhere(
  target: LexicalTargetDto,
): PrismaTypes.CollectedLexicalItemWhereInput {
  switch (target.kind) {
    case LexicalTargetKind.HEADWORD:
      return {
        currentRevision: {
          is: { headwordTarget: { is: { headwordId: target.id } } },
        },
      };
    case LexicalTargetKind.ENTRY:
      return {
        currentRevision: {
          is: { entryTarget: { is: { entryId: target.id } } },
        },
      };
    case LexicalTargetKind.SENSE:
      return {
        currentRevision: {
          is: { senseTarget: { is: { senseId: target.id } } },
        },
      };
    case LexicalTargetKind.COLLOCATION:
      return {
        currentRevision: {
          is: { collocationTarget: { is: { collocationId: target.id } } },
        },
      };
  }
}

function normalizedNote(note: string | undefined): string | null {
  const value = note?.normalize("NFC").trim();
  return value || null;
}

function normalizedTags(tags: string[] | undefined): string[] {
  return [
    ...new Set(
      (tags ?? []).map((tag) => tag.normalize("NFC").trim()).filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function revisionContentHash(
  target: LexicalTargetDto,
  note: string | null,
  tags: string[],
): string {
  return createHash("sha256")
    .update(canonicalJson({ target, note, tags }))
    .digest("hex");
}
