import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type SylisDatabase } from "@sylis/database";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { ActiveReleaseService } from "../../lexicon";
import type {
  BookEditionQueryDto,
  CreateEnrollmentDto,
  MigrateEnrollmentDto,
  UpdateEnrollmentDto,
} from "../dto/books.dto";

@Injectable()
export class BooksService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly releases: ActiveReleaseService,
  ) {}

  async list() {
    const release = await this.releases.resolve();
    const books = await this.database.vocabularyBook.findMany({
      where: {
        editions: {
          some: { releases: { some: { releaseId: release.releaseId } } },
        },
      },
      include: {
        editions: {
          where: { releases: { some: { releaseId: release.releaseId } } },
          orderBy: { publishedAt: "desc" },
          take: 1,
          include: { _count: { select: { items: true } } },
        },
      },
      orderBy: { title: "asc" },
    });
    return { ...release, data: books };
  }

  async edition(bookId: string, editionId: string, query: BookEditionQueryDto) {
    const release = await this.releases.resolve();
    const edition = await this.database.vocabularyBookEdition.findFirst({
      where: {
        id: editionId,
        bookId,
        releases: { some: { releaseId: release.releaseId } },
      },
      include: { book: true },
    });
    if (!edition) throw new NotFoundException();
    const page = await this.database.vocabularyBookItem.findMany({
      where: {
        editionId,
        releaseId: release.releaseId,
        position: { gt: query.after },
      },
      orderBy: { position: "asc" },
      take: query.limit + 1,
    });
    const hasMore = page.length > query.limit;
    const items = page.slice(0, query.limit);
    const idsByKind = new Map<string, string[]>();
    for (const item of items) {
      const ids = idsByKind.get(item.targetKind) ?? [];
      ids.push(item.targetId);
      idsByKind.set(item.targetKind, ids);
    }
    const [headwords, entries, senses, collocations] = await Promise.all([
      this.database.headwordRevision.findMany({
        where: {
          releaseId: release.releaseId,
          headwordId: { in: idsByKind.get("HEADWORD") ?? [] },
        },
        select: { headwordId: true, displayText: true },
      }),
      this.database.lexicalEntryRevision.findMany({
        where: {
          releaseId: release.releaseId,
          entryId: { in: idsByKind.get("ENTRY") ?? [] },
        },
        select: {
          entryId: true,
          partOfSpeechCode: true,
          headwordRevision: { select: { displayText: true } },
        },
      }),
      this.database.lexicalSenseRevision.findMany({
        where: {
          releaseId: release.releaseId,
          senseId: { in: idsByKind.get("SENSE") ?? [] },
        },
        select: {
          senseId: true,
          entryRevision: {
            select: {
              partOfSpeechCode: true,
              headwordRevision: { select: { displayText: true } },
            },
          },
        },
      }),
      this.database.collocation.findMany({
        where: {
          releaseId: release.releaseId,
          id: { in: idsByKind.get("COLLOCATION") ?? [] },
        },
        select: { id: true, canonicalText: true },
      }),
    ]);
    const labels = new Map<string, { displayText: string; detail?: string }>([
      ...headwords.map(
        (item) =>
          [
            `HEADWORD:${item.headwordId}`,
            { displayText: item.displayText },
          ] as const,
      ),
      ...entries.map(
        (item) =>
          [
            `ENTRY:${item.entryId}`,
            {
              displayText: item.headwordRevision.displayText,
              detail: item.partOfSpeechCode,
            },
          ] as const,
      ),
      ...senses.map(
        (item) =>
          [
            `SENSE:${item.senseId}`,
            {
              displayText: item.entryRevision.headwordRevision.displayText,
              detail: item.entryRevision.partOfSpeechCode,
            },
          ] as const,
      ),
      ...collocations.map(
        (item) =>
          [
            `COLLOCATION:${item.id}`,
            { displayText: item.canonicalText },
          ] as const,
      ),
    ]);
    return {
      ...release,
      data: {
        ...edition,
        items: items.map((item) => ({
          ...item,
          ...(labels.get(`${item.targetKind}:${item.targetId}`) ?? {
            displayText: item.targetId,
          }),
        })),
        nextPosition: hasMore ? (items.at(-1)?.position ?? null) : null,
      },
    };
  }

  enrollments(actor: ActorContext) {
    return this.database.userBookEnrollment.findMany({
      where: { userId: actor.userId },
      include: { book: true, edition: true },
      orderBy: { enrolledAt: "desc" },
    });
  }

  async enroll(actor: ActorContext, input: CreateEnrollmentDto) {
    const release = await this.releases.resolve();
    const edition = await this.database.vocabularyBookEdition.findFirst({
      where: {
        id: input.editionId,
        bookId: input.bookId,
        releases: { some: { releaseId: release.releaseId } },
      },
    });
    if (!edition) throw new NotFoundException();
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`book-enrollment:${actor.userId}:${input.bookId}`}, 0)
        )
      `);
      const active = await transaction.userBookEnrollment.findFirst({
        where: { userId: actor.userId, bookId: input.bookId, active: true },
      });
      if (active)
        throw new ConflictException("An active enrollment already exists");
      return transaction.userBookEnrollment.upsert({
        where: {
          userId_bookId_editionId: {
            userId: actor.userId,
            bookId: input.bookId,
            editionId: input.editionId,
          },
        },
        create: {
          userId: actor.userId,
          bookId: input.bookId,
          editionId: input.editionId,
          dailyNewLimit: input.dailyNewLimit,
        },
        update: {
          active: true,
          completedAt: null,
          dailyNewLimit: input.dailyNewLimit,
          enrolledAt: new Date(),
        },
      });
    });
  }

  async update(
    actor: ActorContext,
    enrollmentId: string,
    input: UpdateEnrollmentDto,
  ) {
    const enrollment = await this.database.userBookEnrollment.findFirst({
      where: { id: enrollmentId, userId: actor.userId },
    });
    if (!enrollment) throw new NotFoundException();
    return this.database.userBookEnrollment.update({
      where: { id: enrollment.id },
      data: input,
    });
  }

  async migrate(
    actor: ActorContext,
    enrollmentId: string,
    input: MigrateEnrollmentDto,
  ) {
    const release = await this.releases.resolve();
    const enrollment = await this.database.userBookEnrollment.findFirst({
      where: { id: enrollmentId, userId: actor.userId },
    });
    if (!enrollment) throw new NotFoundException();
    const edition = await this.database.vocabularyBookEdition.findFirst({
      where: {
        id: input.editionId,
        bookId: enrollment.bookId,
        releases: { some: { releaseId: release.releaseId } },
      },
    });
    if (!edition) throw new NotFoundException();
    const preview = {
      fromEditionId: enrollment.editionId,
      toEditionId: edition.id,
      targetItemCount: await this.database.vocabularyBookItem.count({
        where: { editionId: edition.id, releaseId: release.releaseId },
      }),
    };
    if (enrollment.editionId === edition.id) {
      throw new ConflictException("Enrollment already uses this edition");
    }
    if (!input.confirm) return { status: "PREVIEW", ...preview };
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`book-enrollment:${actor.userId}:${enrollment.bookId}`}, 0)
        )
      `);
      const current = await transaction.userBookEnrollment.findFirst({
        where: { id: enrollment.id, userId: actor.userId, active: true },
      });
      if (!current)
        throw new ConflictException("Enrollment is no longer active");
      await transaction.userBookEnrollment.update({
        where: { id: current.id },
        data: { active: false, completedAt: new Date() },
      });
      const migrated = await transaction.userBookEnrollment.upsert({
        where: {
          userId_bookId_editionId: {
            userId: actor.userId,
            bookId: current.bookId,
            editionId: edition.id,
          },
        },
        create: {
          userId: actor.userId,
          bookId: current.bookId,
          editionId: edition.id,
          dailyNewLimit: current.dailyNewLimit,
        },
        update: {
          active: true,
          completedAt: null,
          dailyNewLimit: current.dailyNewLimit,
          enrolledAt: new Date(),
        },
      });
      return { status: "MIGRATED", ...preview, enrollment: migrated };
    });
  }
}
