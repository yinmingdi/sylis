import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AttemptStatus,
  DailyStudyPlanStatus,
  ExerciseAttemptContextKind,
  Prisma,
  RevisionStatus,
  ReviewSnapshotPhase,
  StudyPlanItemMode,
  StudyRecognitionDecision,
  type SylisDatabase,
} from "@sylis/database";
import {
  createEmptyCard,
  fsrs,
  type Card,
  type FSRSParameters,
  type Grade,
} from "ts-fsrs";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import {
  BOOK_ITEM_TARGET_INCLUDE,
  bookItemAnchor,
  expandLexicalAnchors,
  learningTargetKey,
  OBJECTIVE_SUBJECT_INCLUDE,
  objectiveSubjectTargets,
  objectiveTargetWhere,
} from "../../../platform/database/learning-target-projection";
import { ActiveReleaseService } from "../../lexicon";
import {
  StudyProgressEventKind,
  type SubmitReviewDto,
  type UpdateStudyProgressDto,
} from "../dto/study.dto";

@Injectable()
export class StudyService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly releases: ActiveReleaseService,
  ) {}

  async today(actor: ActorContext) {
    const user = await this.database.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { timezone: true },
    });
    const localDate = localDateForTimezone(user.timezone, new Date());
    const date = new Date(`${localDate}T00:00:00.000Z`);
    let plan = await this.database.dailyStudyPlan.findUnique({
      where: {
        userId_localDate: {
          userId: actor.userId,
          localDate: date,
        },
      },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!plan) {
      await this.ensureTodayPlan(actor.userId, user.timezone, date);
      plan = await this.database.dailyStudyPlan.findUnique({
        where: { userId_localDate: { userId: actor.userId, localDate: date } },
        include: { items: { orderBy: { position: "asc" } } },
      });
    }
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

  async planSummary(actor: ActorContext, planId: string) {
    const plan = await this.database.dailyStudyPlan.findFirst({
      where: { id: planId, userId: actor.userId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!plan) throw new NotFoundException();
    const objectives = await this.database.learningObjectiveRevision.findMany({
      where: { id: { in: plan.items.map((item) => item.objectiveRevisionId) } },
      include: {
        ...OBJECTIVE_SUBJECT_INCLUDE,
        hints: {
          orderBy: { displayOrder: "asc" },
          select: { hintKind: true, languageTag: true, text: true },
        },
      },
    });
    const objectiveById = new Map(
      objectives.map((objective) => [
        objective.id,
        {
          id: objective.id,
          knowledgeFacet: objective.knowledgeFacet,
          retrievalDirection: objective.retrievalDirection,
          subjects: objectiveSubjectTargets(objective),
          hints: objective.hints,
        },
      ]),
    );
    return {
      id: plan.id,
      releaseId: plan.releaseId,
      localDate: plan.localDate,
      timezone: plan.timezone,
      status: plan.status,
      items: plan.items.map((item) => ({
        id: item.id,
        position: item.position,
        mode: item.mode,
        completedAt: item.completedAt,
        objective: objectiveById.get(item.objectiveRevisionId),
      })),
    };
  }

  private async ensureTodayPlan(
    userId: string,
    timezone: string,
    localDate: Date,
  ): Promise<void> {
    const release = await this.releases.resolve();
    await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`daily-study-plan:${userId}:${localDate.toISOString()}`}, 0)
        )::text
      `);
      const existing = await transaction.dailyStudyPlan.findUnique({
        where: { userId_localDate: { userId, localDate } },
      });
      if (existing) return;
      const enrollment = await transaction.userBookEnrollment.findFirst({
        where: { userId, active: true },
        orderBy: [{ enrolledAt: "desc" }, { id: "desc" }],
      });
      if (!enrollment) return;
      const bookItems = await transaction.vocabularyBookItem.findMany({
        where: { editionId: enrollment.editionId },
        include: BOOK_ITEM_TARGET_INCLUDE,
        orderBy: { position: "asc" },
        take: enrollment.dailyNewLimit,
      });
      const anchors = bookItems.map(bookItemAnchor);
      const targetsByAnchor = await expandLexicalAnchors(
        transaction,
        release.releaseId,
        anchors,
      );
      const targetKeys = new Set(
        [...targetsByAnchor.values()].flatMap((targets) => [...targets]),
      );
      const objectives =
        targetKeys.size === 0
          ? []
          : await transaction.learningObjectiveRevision.findMany({
              where: {
                releaseId: release.releaseId,
                status: RevisionStatus.PUBLISHED,
                ...objectiveTargetWhere(targetKeys),
              },
              include: OBJECTIVE_SUBJECT_INCLUDE,
              orderBy: { objectiveId: "asc" },
            });
      const objectiveByTarget = new Map<string, (typeof objectives)[number]>();
      for (const objective of objectives) {
        for (const target of objectiveSubjectTargets(objective)) {
          const key = learningTargetKey(target.targetKind, target.targetId);
          if (!objectiveByTarget.has(key))
            objectiveByTarget.set(key, objective);
        }
      }
      const planObjectives = bookItems.flatMap((item, index) => {
        const anchor = anchors[index];
        if (!anchor) return [];
        const expandedTargets = targetsByAnchor.get(
          learningTargetKey(anchor.targetKind, anchor.targetId),
        );
        const objective = [...(expandedTargets ?? [])]
          .map((key) => objectiveByTarget.get(key))
          .find((candidate) => candidate !== undefined);
        return objective ? [objective] : [];
      });
      await transaction.dailyStudyPlan.create({
        data: {
          userId,
          enrollmentId: enrollment.id,
          releaseId: release.releaseId,
          localDate,
          timezone,
          status: DailyStudyPlanStatus.READY,
          items: {
            create: planObjectives.map((objective, position) => ({
              objectiveRevisionId: objective.id,
              position,
              mode: StudyPlanItemMode.NEW,
            })),
          },
        },
      });
    });
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
          where: { status: RevisionStatus.PUBLISHED },
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

  async progress(
    actor: ActorContext,
    planItemId: string,
    input: UpdateStudyProgressDto,
  ) {
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT item.id
          FROM "DailyStudyPlanItem" item
          JOIN "DailyStudyPlan" plan ON plan.id = item."planId"
          WHERE item.id = ${planItemId}::uuid
            AND plan."userId" = ${actor.userId}::uuid
          FOR UPDATE OF item
        `,
      );
      if (!rows[0]) throw new NotFoundException();
      const current = await transaction.dailyStudyPlanItem.findUniqueOrThrow({
        where: { id: planItemId },
      });
      if (current.completedAt) return studyProgressView(current, false);

      if (input.eventKind === StudyProgressEventKind.RECOGNITION) {
        if (!input.recognitionDecision) {
          throw new UnprocessableEntityException(
            "Recognition decision is required",
          );
        }
        const recognized =
          input.recognitionDecision === StudyRecognitionDecision.RECOGNIZED;
        const updated = await transaction.dailyStudyPlanItem.update({
          where: { id: planItemId },
          data: {
            recognitionDecision: input.recognitionDecision,
            correctStreak: recognized ? 1 : 0,
            requiredCorrectCount: recognized ? 1 : 3,
          },
        });
        return studyProgressView(updated, false);
      }

      if (input.correct === undefined) {
        throw new UnprocessableEntityException(
          "Answer correctness is required",
        );
      }
      const updated = await transaction.dailyStudyPlanItem.update({
        where: { id: planItemId },
        data: {
          correctStreak: input.correct ? current.correctStreak + 1 : 0,
        },
      });
      return studyProgressView(
        updated,
        input.correct && updated.correctStreak >= updated.requiredCorrectCount,
      );
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
        )::text
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
        attempt.contextKind !== ExerciseAttemptContextKind.STUDY ||
        attempt.status !== AttemptStatus.SUBMITTED ||
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
        )::text
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
          releaseId: attempt.releaseId,
          attemptId: attempt.id,
          objectiveRevisionId: objectiveRevision.id,
          parameterSetId: parameterSet.id,
          rating: input.rating,
          reviewedAt: now,
          idempotencyKey,
          snapshots: {
            create: [
              this.snapshot(ReviewSnapshotPhase.BEFORE, before),
              this.snapshot(ReviewSnapshotPhase.AFTER, scheduled),
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
          releaseId: attempt.releaseId,
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
          releaseId: attempt.releaseId,
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
        where: { userId: actor.userId, status: AttemptStatus.SUBMITTED },
      }),
      this.database.userObjectiveMemoryState.count({
        where: { userId: actor.userId, dueAt: { lte: new Date() } },
      }),
    ]);
    return { reviews, attempts, due };
  }

  private snapshot(phase: ReviewSnapshotPhase, card: Card) {
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

function studyProgressView(
  item: {
    id: string;
    recognitionDecision: StudyRecognitionDecision;
    correctStreak: number;
    requiredCorrectCount: number;
    completedAt: Date | null;
  },
  readyForReview: boolean,
) {
  return {
    planItemId: item.id,
    recognitionDecision: item.recognitionDecision,
    correctCount: item.correctStreak,
    requiredCorrectCount: item.requiredCorrectCount,
    isCompletedToday: item.completedAt !== null,
    readyForReview,
  };
}

function localDateForTimezone(timezone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type)?.value;
    if (!part) throw new Error(`LOCAL_DATE_PART_MISSING:${type}`);
    return part;
  };
  return `${value("year")}-${value("month")}-${value("day")}`;
}
