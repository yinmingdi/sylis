import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@sylis/database";
import type { SylisDatabase, SylisTransaction } from "@sylis/database";
import { randomUUID } from "node:crypto";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
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

const normalizeTitle = (title: string): string =>
  title.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");

@Injectable()
export class NotebooksService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: FieldEncryptionService,
    private readonly releases: ActiveReleaseService,
    private readonly targetPresentations: LexicalTargetPresentationService,
  ) {}

  list(actor: ActorContext) {
    return this.database.notebook.findMany({
      where: { userId: actor.userId },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  create(actor: ActorContext, input: CreateNotebookDto) {
    return this.database.notebook.create({
      data: {
        userId: actor.userId,
        title: input.title.trim(),
        normalizedTitle: normalizeTitle(input.title),
        description: input.description,
      },
    });
  }

  async get(actor: ActorContext, id: string) {
    const notebook = await this.database.notebook.findFirst({
      where: { id, userId: actor.userId },
      include: { _count: { select: { items: true } } },
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
          title: input.title.trim(),
          normalizedTitle: normalizeTitle(input.title),
          description: input.description,
        },
      });
    });
  }

  async remove(actor: ActorContext, id: string) {
    await this.database.$transaction(async (transaction) => {
      await this.lockNotebook(transaction, actor.userId, id);
      await transaction.notebook.delete({ where: { id } });
    });
  }

  async items(actor: ActorContext, notebookId: string) {
    await this.get(actor, notebookId);
    const items = await this.database.collectedLexicalItem.findMany({
      where: { notebookId },
      orderBy: { position: "asc" },
    });
    const presentations = await this.targetPresentations.resolve(items);
    return items.map((item) => ({
      ...this.serializeItem(item),
      ...presentations.get(lexicalTargetKey(item)),
    }));
  }

  async addItem(
    actor: ActorContext,
    notebookId: string,
    input: AddNotebookItemDto,
  ) {
    const release = await this.releases.resolve();
    const id = randomUUID();
    const note = input.note
      ? this.encryption.encrypt(input.note, `notebook-item:${id}`)
      : null;
    const item = await this.database.$transaction(async (transaction) => {
      await this.lockNotebook(transaction, actor.userId, notebookId);
      await this.assertTarget(transaction, release.releaseId, input.target);
      const existing = await transaction.collectedLexicalItem.findUnique({
        where: {
          notebookId_releaseId_targetKind_targetId: {
            notebookId,
            releaseId: release.releaseId,
            targetKind: input.target.kind,
            targetId: input.target.id,
          },
        },
      });
      if (existing) return existing;
      const last = await transaction.collectedLexicalItem.findFirst({
        where: { notebookId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return transaction.collectedLexicalItem.create({
        data: {
          id,
          notebookId,
          releaseId: release.releaseId,
          targetKind: input.target.kind,
          targetId: input.target.id,
          noteCiphertext: note?.ciphertext,
          keyVersion: note?.keyVersion,
          position: (last?.position ?? -1) + 1,
          tags: input.tags ?? [],
        },
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
        where: { notebookId },
        orderBy: { position: "asc" },
      });
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) throw new NotFoundException();
      const note =
        input.note === undefined
          ? undefined
          : input.note
            ? this.encryption.encrypt(input.note, `notebook-item:${item.id}`)
            : null;
      if (input.position !== undefined && items.length > 1) {
        const reordered = items.filter((candidate) => candidate.id !== itemId);
        reordered.splice(Math.min(input.position, reordered.length), 0, item);
        await this.writePositions(
          transaction,
          notebookId,
          reordered.map((candidate) => candidate.id),
        );
      }
      return transaction.collectedLexicalItem.update({
        where: { id: item.id },
        data: {
          noteCiphertext:
            note === undefined ? undefined : (note?.ciphertext ?? null),
          keyVersion:
            note === undefined ? undefined : (note?.keyVersion ?? null),
          tags: input.tags,
        },
      });
    });
    return this.serializeItem(updated);
  }

  async removeItem(actor: ActorContext, notebookId: string, itemId: string) {
    await this.database.$transaction(async (transaction) => {
      await this.lockNotebook(transaction, actor.userId, notebookId);
      const deleted = await transaction.collectedLexicalItem.deleteMany({
        where: { id: itemId, notebookId },
      });
      if (deleted.count !== 1) throw new NotFoundException();
      const remaining = await transaction.collectedLexicalItem.findMany({
        where: { notebookId },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      await this.writePositions(
        transaction,
        notebookId,
        remaining.map((item) => item.id),
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
      WHERE id = ${notebookId}::uuid AND "userId" = ${userId}::uuid
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

  private serializeItem<
    T extends {
      id: string;
      noteCiphertext: Uint8Array | null;
      keyVersion: string | null;
    },
  >(item: T) {
    const { noteCiphertext, keyVersion, ...publicItem } = item;
    return {
      ...publicItem,
      note:
        noteCiphertext && keyVersion
          ? this.encryption.decrypt(
              { ciphertext: noteCiphertext, keyVersion },
              `notebook-item:${item.id}`,
            )
          : null,
    };
  }

  private async assertTarget(
    transaction: SylisTransaction,
    releaseId: string,
    target: LexicalTargetDto,
  ): Promise<void> {
    const count =
      target.kind === "HEADWORD"
        ? await transaction.headwordRevision.count({
            where: { releaseId, headwordId: target.id },
          })
        : target.kind === "ENTRY"
          ? await transaction.lexicalEntryRevision.count({
              where: { releaseId, entryId: target.id },
            })
          : target.kind === "SENSE"
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
