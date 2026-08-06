import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type SylisDatabase } from "@sylis/database";
import { createHash } from "node:crypto";
import {
  createEmptyCard,
  fsrs,
  type Card,
  type Grade,
  type FSRSParameters,
} from "ts-fsrs";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { JobsService } from "../../jobs";
import { ActiveReleaseService } from "../../lexicon";
import type { SubmitReviewDto } from "../dto/study.dto";

@Injectable()
export class StudyService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly jobs: JobsService,
    private readonly releases: ActiveReleaseService,
  ) {}

  async requestDailyPlan(actor: ActorContext, idempotencyKey: string) {
    const [user, release] = await Promise.all([
      this.database.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { timezone: true },
      }),
      this.releases.resolve(),
    ]);
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: user.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const input = {
      userId: actor.userId,
      releaseId: release.releaseId,
      localDate,
      timezone: user.timezone,
    };
    return this.database.$transaction((transaction) =>
      this.jobs.create(transaction, {
        kind: "DAILY_PLAN",
        requestRefId: actor.userId,
        inputHash: `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`,
        idempotencyKey,
        requestedByUserId: actor.userId,
        subjectUserId: actor.userId,
        audience: "USER",
        priority: 10,
      }),
    );
  }

  async today(actor: ActorContext) {
    const user = await this.database.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { timezone: true },
    });
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: user.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const plan = await this.database.dailyStudyPlan.findUnique({
      where: {
        userId_localDate: {
          userId: actor.userId,
          localDate: new Date(`${localDate}T00:00:00.000Z`),
        },
      },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!plan) return { status: "NOT_READY", localDate, items: [] };
    const objectives = await this.database.learningObjectiveRevision.findMany({
      where: { id: { in: plan.items.map((item) => item.objectiveRevisionId) } },
      include: { hints: { orderBy: { displayOrder: "asc" } } },
    });
    const byId = new Map(
      objectives.map((objective) => [objective.id, objective]),
    );
    return {
      id: plan.id,
      status: plan.status,
      localDate,
      releaseId: plan.releaseId,
      items: plan.items.map((item) => ({
        ...item,
        objective: byId.get(item.objectiveRevisionId),
      })),
    };
  }

  async objective(actor: ActorContext, objectiveId: string) {
    const planItem = await this.database.dailyStudyPlanItem.findFirst({
      where: {
        objectiveRevisionId: objectiveId,
        plan: { userId: actor.userId },
      },
      orderBy: { plan: { localDate: "desc" } },
    });
    if (!planItem) throw new NotFoundException();
    return this.database.learningObjectiveRevision.findUniqueOrThrow({
      where: { id: planItem.objectiveRevisionId },
      include: {
        hints: { orderBy: { displayOrder: "asc" } },
        exerciseRevisions: {
          where: { status: "PUBLISHED" },
          select: {
            id: true,
            exerciseTaskKind: true,
            evidenceKind: true,
            responseKind: true,
            authoredDifficultyTier: true,
          },
        },
      },
    });
  }

  async review(
    actor: ActorContext,
    input: SubmitReviewDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey)
      throw new ConflictException("Idempotency-Key is required");
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`review:${actor.userId}:${idempotencyKey}`}, 0)
        )
      `);
      const existing = await transaction.reviewEvent.findUnique({
        where: {
          userId_idempotencyKey: { userId: actor.userId, idempotencyKey },
        },
        include: { snapshots: true },
      });
      if (existing) {
        if (
          existing.attemptId !== input.attemptId ||
          existing.rating !== input.rating
        ) {
          throw new ConflictException(
            "Idempotency key reused with different input",
          );
        }
        return existing;
      }
      const attempts = await transaction.$queryRaw<
        Array<{ id: string }>
      >(Prisma.sql`
        SELECT id FROM "ExerciseAttempt"
        WHERE id = ${input.attemptId}::uuid AND "userId" = ${actor.userId}::uuid
        FOR UPDATE
      `);
      if (!attempts[0]) throw new NotFoundException();
      const attempt = await transaction.exerciseAttempt.findUniqueOrThrow({
        where: { id: input.attemptId },
        include: {
          dailyStudyPlanItem: true,
          reviewEvent: true,
        },
      });
      if (
        attempt.contextKind !== "STUDY" ||
        attempt.status !== "SUBMITTED" ||
        !attempt.dailyStudyPlanItem ||
        attempt.reviewEvent
      ) {
        throw new ConflictException("Attempt is not reviewable");
      }
      const objectiveRevision =
        await transaction.learningObjectiveRevision.findUniqueOrThrow({
          where: { id: attempt.dailyStudyPlanItem.objectiveRevisionId },
        });
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`fsrs:${actor.userId}:${objectiveRevision.objectiveId}`}, 0)
        )
      `);
      const now = new Date();
      const parameterSet = await transaction.fSRSParameterSet.findFirst({
        where: { effectiveAt: { lte: now } },
        orderBy: { effectiveAt: "desc" },
      });
      if (!parameterSet)
        throw new ConflictException("FSRS parameters are not configured");
      const current = await transaction.userObjectiveMemoryState.findUnique({
        where: {
          userId_objectiveId: {
            userId: actor.userId,
            objectiveId: objectiveRevision.objectiveId,
          },
        },
      });
      const before: Card = current
        ? ({
            due: current.dueAt,
            stability: current.stability,
            difficulty: current.difficulty,
            elapsed_days: current.elapsedDays,
            scheduled_days: current.scheduledDays,
            reps: current.reviewCount,
            lapses: current.lapseCount,
            state: current.fsrsState,
            last_review: current.lastReviewedAt ?? undefined,
          } as Card)
        : createEmptyCard(now);
      const scheduler = fsrs(
        parameterSet.parameters as unknown as Partial<FSRSParameters>,
      );
      const scheduled = scheduler.next(before, now, input.rating as Grade).card;
      const event = await transaction.reviewEvent.create({
        data: {
          userId: actor.userId,
          attemptId: attempt.id,
          objectiveRevisionId: objectiveRevision.id,
          parameterSetId: parameterSet.id,
          rating: input.rating,
          reviewedAt: now,
          idempotencyKey,
          snapshots: {
            create: [
              this.snapshot("BEFORE", before),
              this.snapshot("AFTER", scheduled),
            ],
          },
        },
        include: { snapshots: true },
      });
      await transaction.userObjectiveMemoryState.upsert({
        where: {
          userId_objectiveId: {
            userId: actor.userId,
            objectiveId: objectiveRevision.objectiveId,
          },
        },
        create: {
          userId: actor.userId,
          objectiveId: objectiveRevision.objectiveId,
          objectiveRevisionId: objectiveRevision.id,
          dueAt: scheduled.due,
          fsrsState: scheduled.state,
          stability: scheduled.stability,
          difficulty: scheduled.difficulty,
          elapsedDays: scheduled.elapsed_days,
          scheduledDays: scheduled.scheduled_days,
          reviewCount: scheduled.reps,
          lapseCount: scheduled.lapses,
          lastReviewedAt: scheduled.last_review,
        },
        update: {
          objectiveRevisionId: objectiveRevision.id,
          dueAt: scheduled.due,
          fsrsState: scheduled.state,
          stability: scheduled.stability,
          difficulty: scheduled.difficulty,
          elapsedDays: scheduled.elapsed_days,
          scheduledDays: scheduled.scheduled_days,
          reviewCount: scheduled.reps,
          lapseCount: scheduled.lapses,
          lastReviewedAt: scheduled.last_review,
          version: { increment: 1 },
        },
      });
      await transaction.dailyStudyPlanItem.update({
        where: { id: attempt.dailyStudyPlanItem.id },
        data: { completedAt: now },
      });
      return event;
    });
  }

  async stats(actor: ActorContext) {
    const [reviews, attempts, due] = await Promise.all([
      this.database.reviewEvent.count({ where: { userId: actor.userId } }),
      this.database.exerciseAttempt.count({
        where: { userId: actor.userId, status: "SUBMITTED" },
      }),
      this.database.userObjectiveMemoryState.count({
        where: { userId: actor.userId, dueAt: { lte: new Date() } },
      }),
    ]);
    return { reviews, attempts, due };
  }

  private snapshot(phase: string, card: Card) {
    return {
      phase,
      dueAt: card.due,
      fsrsState: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
    };
  }
}
