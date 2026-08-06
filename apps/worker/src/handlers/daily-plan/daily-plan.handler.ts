import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@sylis/database";
import type { SylisDatabase } from "@sylis/database";

import { WORKER_DATABASE } from "../../adapters/database/database.module";
import type { ClaimedWorkerJob } from "../../runtime/job-runtime.service";
import { JobRuntimeService } from "../../runtime/job-runtime.service";
import type { WorkerHandler } from "../../runtime/worker-handler";

@Injectable()
export class DailyPlanHandler implements WorkerHandler {
  readonly kind = "DAILY_PLAN" as const;

  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
    private readonly runtime: JobRuntimeService,
  ) {}

  async run(job: ClaimedWorkerJob): Promise<void> {
    const userId = job.subjectUserId;
    if (!userId) throw new Error("DAILY_PLAN_USER_MISSING");
    const [user, lexicon] = await Promise.all([
      this.database.user.findUniqueOrThrow({
        where: { id: userId },
        select: { timezone: true },
      }),
      this.database.lexicon.findFirst({
        where: { activeReleaseId: { not: null } },
        select: { activeReleaseId: true },
      }),
    ]);
    if (!lexicon?.activeReleaseId)
      throw new Error("ACTIVE_LEXICON_RELEASE_MISSING");
    const releaseId = lexicon.activeReleaseId;
    const localDateText = new Intl.DateTimeFormat("en-CA", {
      timeZone: user.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const localDate = new Date(`${localDateText}T00:00:00.000Z`);
    const existing = await this.database.dailyStudyPlan.findUnique({
      where: { userId_localDate: { userId, localDate } },
      select: { id: true },
    });
    if (existing) {
      await this.runtime.report(job, {
        stage: "PLAN_REUSED",
        processed: 1,
        total: 1,
        message: existing.id,
      });
      return;
    }

    await this.runtime.report(job, {
      stage: "SELECTING_DUE",
      processed: 0,
      total: null,
    });
    const [dueStates, enrollments] = await Promise.all([
      this.database.userObjectiveMemoryState.findMany({
        where: {
          userId,
          dueAt: { lte: new Date() },
          objectiveRevision: { releaseId, status: "PUBLISHED" },
        },
        orderBy: [{ dueAt: "asc" }, { objectiveRevisionId: "asc" }],
        take: 200,
      }),
      this.database.userBookEnrollment.findMany({
        where: { userId, active: true },
        include: {
          edition: {
            include: {
              items: {
                where: { releaseId },
                orderBy: { position: "asc" },
              },
            },
          },
        },
        orderBy: { enrolledAt: "asc" },
      }),
    ]);
    const selected = new Map<string, "REVIEW" | "NEW">();
    for (const state of dueStates)
      selected.set(state.objectiveRevisionId, "REVIEW");

    await this.runtime.report(job, {
      stage: "SELECTING_NEW",
      processed: selected.size,
      total: null,
    });
    const existingObjectiveIds = new Set(
      (
        await this.database.userObjectiveMemoryState.findMany({
          where: { userId },
          select: { objectiveId: true },
        })
      ).map((state) => state.objectiveId),
    );
    for (const enrollment of enrollments) {
      const targets = enrollment.edition.items.map((item) => ({
        targetKind: item.targetKind,
        targetId: item.targetId,
      }));
      if (targets.length === 0) continue;
      const candidates = await this.database.learningObjectiveSubject.findMany({
        where: {
          OR: targets,
          objectiveRevision: { releaseId, status: "PUBLISHED" },
        },
        include: {
          objectiveRevision: { select: { id: true, objectiveId: true } },
        },
      });
      const byTarget = new Map(
        candidates.map((candidate) => [
          `${candidate.targetKind}:${candidate.targetId}`,
          candidate.objectiveRevision,
        ]),
      );
      let added = 0;
      for (const item of enrollment.edition.items) {
        if (added >= enrollment.dailyNewLimit) break;
        const objective = byTarget.get(`${item.targetKind}:${item.targetId}`);
        if (
          !objective ||
          existingObjectiveIds.has(objective.objectiveId) ||
          selected.has(objective.id)
        )
          continue;
        selected.set(objective.id, "NEW");
        added += 1;
      }
    }
    if (await this.runtime.cancellationRequested(job))
      throw new Error("JOB_CANCELLED");
    const items = [...selected.entries()];
    const result = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`daily-plan:${userId}:${localDateText}`}, 0)
        )
      `);
      const replay = await transaction.dailyStudyPlan.findUnique({
        where: { userId_localDate: { userId, localDate } },
      });
      if (replay) return { plan: replay, created: false };
      const created = await transaction.dailyStudyPlan.create({
        data: {
          userId,
          enrollmentId: enrollments.length === 1 ? enrollments[0]!.id : null,
          releaseId,
          localDate,
          timezone: user.timezone,
          status: "READY",
        },
      });
      if (items.length > 0) {
        await transaction.dailyStudyPlanItem.createMany({
          data: items.map(([objectiveRevisionId, mode], position) => ({
            planId: created.id,
            objectiveRevisionId,
            position,
            mode,
          })),
        });
      }
      return { plan: created, created: true };
    });
    const stage = result.created ? "PLAN_CREATED" : "PLAN_REUSED";
    await this.runtime.checkpoint(job, {
      stage,
      planId: result.plan.id,
      localDate: localDateText,
      itemCount: result.created ? items.length : undefined,
    });
    await this.runtime.report(job, {
      stage,
      processed: result.created ? items.length : 1,
      total: result.created ? items.length : 1,
      message: result.plan.id,
    });
  }
}
