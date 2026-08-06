import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type PrismaTypes, type SylisDatabase } from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { ExerciseDeliveryService } from "../../exercises/services/exercise-delivery.service";
import { ActiveReleaseService } from "../../lexicon/services/active-release.service";
import type {
  CreateAssessmentSessionDto,
  SubmitAssessmentResponseDto,
} from "../dto/assessments.dto";

const SELECTION_ALGORITHM = "deterministic-blueprint/1";

const orderBySeed = (seed: string, id: string): string =>
  createHash("sha256").update(`${seed}:${id}`).digest("hex");

const targetKey = (targetKind: string, targetId: string): string =>
  `${targetKind}:${targetId}`;

type CandidateExercise = PrismaTypes.ExerciseRevisionGetPayload<{
  include: {
    choices: true;
    learningObjectiveRevision: { include: { subjects: true } };
  };
}>;

type BlueprintWithSections = PrismaTypes.AssessmentBlueprintRevisionGetPayload<{
  include: {
    blueprint: true;
    sections: { include: { rules: true } };
  };
}>;

type BlueprintSection = BlueprintWithSections["sections"][number];
type SelectionRule = BlueprintSection["rules"][number];

interface SelectedExercise {
  section: BlueprintSection;
  exercise: CandidateExercise;
}

@Injectable()
export class AssessmentsService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly releases: ActiveReleaseService,
    private readonly exercises: ExerciseDeliveryService,
  ) {}

  async blueprints() {
    const release = await this.releases.resolve();
    const revisions = await this.database.assessmentBlueprintRevision.findMany({
      where: { releaseId: release.releaseId, status: "PUBLISHED" },
      include: {
        blueprint: true,
        sections: {
          orderBy: { position: "asc" },
          include: { rules: { orderBy: { position: "asc" } } },
        },
      },
      orderBy: { title: "asc" },
    });
    return { ...release, data: revisions };
  }

  async createSession(
    actor: ActorContext,
    input: CreateAssessmentSessionDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new ConflictException("Idempotency-Key is required");
    }
    const release = await this.releases.resolve();
    const sessionId = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`assessment-idempotency:${actor.userId}:${idempotencyKey}`}, 0)
        )
      `);
      const existing = await transaction.assessmentSession.findUnique({
        where: {
          userId_idempotencyKey: { userId: actor.userId, idempotencyKey },
        },
      });
      if (existing) {
        if (existing.blueprintRevisionId !== input.blueprintRevisionId) {
          throw new ConflictException(
            "Idempotency key reused with different input",
          );
        }
        return existing.id;
      }
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`assessment-user:${actor.userId}`}, 0)
        )
      `);
      const blueprint = await transaction.assessmentBlueprintRevision.findFirst(
        {
          where: {
            id: input.blueprintRevisionId,
            releaseId: release.releaseId,
            status: "PUBLISHED",
          },
          include: {
            blueprint: true,
            sections: {
              orderBy: { position: "asc" },
              include: { rules: { orderBy: { position: "asc" } } },
            },
          },
        },
      );
      if (!blueprint) throw new NotFoundException();
      if (blueprint.selectionAlgorithm !== SELECTION_ALGORITHM) {
        throw new ConflictException(
          "Assessment selection algorithm is unsupported",
        );
      }
      const seed = randomUUID();
      const selected = await this.selectExercises(
        transaction,
        actor.userId,
        blueprint,
        seed,
      );
      const id = randomUUID();
      await transaction.assessmentSession.create({
        data: {
          id,
          userId: actor.userId,
          blueprintRevisionId: blueprint.id,
          selectionSeed: seed,
          selectionAlgorithmVersion: blueprint.selectionAlgorithm,
          status: "IN_PROGRESS",
          idempotencyKey,
          expiresAt: blueprint.timeLimitSeconds
            ? new Date(Date.now() + blueprint.timeLimitSeconds * 1_000)
            : null,
        },
      });
      const attemptCounts = await transaction.exerciseAttempt.groupBy({
        by: ["exerciseRevisionId"],
        where: {
          userId: actor.userId,
          contextKind: "ASSESSMENT",
          exerciseRevisionId: {
            in: selected.map((item) => item.exercise.id),
          },
        },
        _count: { _all: true },
      });
      const nextAttemptNo = new Map(
        attemptCounts.map((item) => [
          item.exerciseRevisionId,
          item._count._all + 1,
        ]),
      );
      for (const [position, item] of selected.entries()) {
        const exercise = item.exercise;
        const sessionItem = await transaction.assessmentSessionItem.create({
          data: {
            sessionId: id,
            assessmentSectionId: item.section.id,
            exerciseRevisionId: exercise.id,
            position,
            maxScore: exercise.maxScore,
          },
        });
        const attemptId = randomUUID();
        await transaction.exerciseAttempt.create({
          data: {
            id: attemptId,
            userId: actor.userId,
            exerciseRevisionId: exercise.id,
            assessmentSessionItemId: sessionItem.id,
            contextKind: "ASSESSMENT",
            attemptNo: nextAttemptNo.get(exercise.id) ?? 1,
            maxScore: exercise.maxScore,
            idempotencyKey: `assessment:${id}:${position}`,
          },
        });
        const choiceOrder = [...exercise.choices].sort((left, right) =>
          exercise.shuffleChoices
            ? orderBySeed(attemptId, left.id).localeCompare(
                orderBySeed(attemptId, right.id),
              )
            : left.displayOrder - right.displayOrder,
        );
        if (choiceOrder.length > 0) {
          await transaction.attemptPresentedChoice.createMany({
            data: choiceOrder.map((choice, choicePosition) => ({
              attemptId,
              choiceId: choice.id,
              position: choicePosition,
            })),
          });
        }
      }
      return id;
    });
    return this.session(actor, sessionId);
  }

  async session(actor: ActorContext, sessionId: string) {
    const session = await this.database.assessmentSession.findFirst({
      where: { id: sessionId, userId: actor.userId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: {
            assessmentSection: {
              select: { id: true, sectionKey: true, title: true },
            },
            attempts: { orderBy: { attemptNo: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!session) throw new NotFoundException();
    const expired =
      session.status === "IN_PROGRESS" &&
      session.expiresAt !== null &&
      session.expiresAt <= new Date();
    const delivered = await Promise.all(
      session.items.flatMap((item) =>
        item.attempts.map(async (attempt) => ({
          ...(await this.exercises.deliver(attempt.id, actor.userId)),
          section: item.assessmentSection,
        })),
      ),
    );
    return {
      ...session,
      status: expired ? "EXPIRED" : session.status,
      items: delivered,
    };
  }

  async respond(
    actor: ActorContext,
    sessionId: string,
    input: SubmitAssessmentResponseDto,
    idempotencyKey: string,
  ) {
    const attempt = await this.database.exerciseAttempt.findFirst({
      where: {
        id: input.attemptId,
        userId: actor.userId,
        assessmentSessionItem: { sessionId },
      },
    });
    if (!attempt) throw new NotFoundException();
    return this.exercises.submit(
      actor,
      attempt.id,
      input.response,
      idempotencyKey,
    );
  }

  async submit(actor: ActorContext, sessionId: string) {
    return this.database.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id
          FROM "AssessmentSession"
          WHERE id = ${sessionId}::uuid AND "userId" = ${actor.userId}::uuid
          FOR UPDATE
        `,
      );
      if (!locked[0]) throw new NotFoundException();
      const session = await transaction.assessmentSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: {
          items: {
            include: {
              assessmentSection: {
                select: { id: true, sectionKey: true, title: true },
              },
              attempts: {
                orderBy: { attemptNo: "desc" },
                take: 1,
              },
            },
          },
          result: true,
        },
      });
      if (session.result) return session.result;
      if (session.status !== "IN_PROGRESS") {
        throw new ConflictException("Assessment is not in progress");
      }
      if (session.expiresAt && session.expiresAt <= new Date()) {
        throw new ConflictException("Assessment has expired");
      }
      const attempts = session.items.map((item) => item.attempts[0]);
      if (
        attempts.length !== session.items.length ||
        attempts.some((attempt) => !attempt || attempt.status !== "SUBMITTED")
      ) {
        throw new ConflictException("Assessment is incomplete");
      }
      const rawScore = attempts.reduce(
        (sum, attempt) => sum.add(attempt!.score ?? 0),
        new Prisma.Decimal(0),
      );
      const maxScore = attempts.reduce(
        (sum, attempt) => sum.add(attempt!.maxScore),
        new Prisma.Decimal(0),
      );
      const sectionScores = new Map<
        string,
        {
          sectionKey: string;
          title: string;
          rawScore: PrismaTypes.Decimal;
          maxScore: PrismaTypes.Decimal;
        }
      >();
      session.items.forEach((item, index) => {
        const current = sectionScores.get(item.assessmentSection.id) ?? {
          sectionKey: item.assessmentSection.sectionKey,
          title: item.assessmentSection.title,
          rawScore: new Prisma.Decimal(0),
          maxScore: new Prisma.Decimal(0),
        };
        current.rawScore = current.rawScore.add(attempts[index]!.score ?? 0);
        current.maxScore = current.maxScore.add(attempts[index]!.maxScore);
        sectionScores.set(item.assessmentSection.id, current);
      });
      const sections = Object.fromEntries(
        [...sectionScores].map(([id, score]) => [
          id,
          {
            sectionKey: score.sectionKey,
            title: score.title,
            rawScore: score.rawScore.toNumber(),
            maxScore: score.maxScore.toNumber(),
            ratio: score.maxScore.isZero()
              ? 0
              : score.rawScore.div(score.maxScore).toNumber(),
          },
        ]),
      );
      await transaction.assessmentSession.update({
        where: { id: session.id },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
      return transaction.assessmentResult.create({
        data: {
          sessionId: session.id,
          rawScore,
          maxScore,
          domainScore: {
            overall: maxScore.isZero() ? 0 : rawScore.div(maxScore).toNumber(),
            sections,
          },
        },
      });
    });
  }

  async result(actor: ActorContext, sessionId: string) {
    const result = await this.database.assessmentResult.findFirst({
      where: { session: { id: sessionId, userId: actor.userId } },
    });
    if (!result) throw new NotFoundException();
    return result;
  }

  history(actor: ActorContext, limit: number) {
    return this.database.assessmentSession.findMany({
      where: { userId: actor.userId },
      include: { result: true },
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 100),
    });
  }

  private async selectExercises(
    transaction: PrismaTypes.TransactionClient,
    userId: string,
    blueprint: BlueprintWithSections,
    seed: string,
  ): Promise<SelectedExercise[]> {
    if (blueprint.sections.length === 0) {
      throw new ConflictException("Assessment blueprint has no sections");
    }
    const sectionById = new Map(
      blueprint.sections.map((section) => [section.id, section]),
    );
    const childIds = new Set(
      blueprint.sections.flatMap((section) =>
        section.parentSectionId ? [section.parentSectionId] : [],
      ),
    );
    const leaves = blueprint.sections.filter(
      (section) => !childIds.has(section.id),
    );
    const ancestorsByLeaf = new Map<string, BlueprintSection[]>();
    for (const leaf of leaves) {
      const ancestors: BlueprintSection[] = [];
      const visited = new Set<string>();
      let current: BlueprintSection | undefined = leaf;
      while (current) {
        if (visited.has(current.id)) {
          throw new ConflictException(
            "Assessment section tree contains a cycle",
          );
        }
        visited.add(current.id);
        ancestors.unshift(current);
        current = current.parentSectionId
          ? sectionById.get(current.parentSectionId)
          : undefined;
        if (current === undefined && ancestors[0]?.parentSectionId) {
          throw new ConflictException("Assessment section parent is missing");
        }
      }
      ancestorsByLeaf.set(leaf.id, ancestors);
    }
    for (const section of blueprint.sections.filter((item) =>
      childIds.has(item.id),
    )) {
      const descendantCount = leaves
        .filter((leaf) =>
          ancestorsByLeaf
            .get(leaf.id)
            ?.some((ancestor) => ancestor.id === section.id),
        )
        .reduce((total, leaf) => total + leaf.itemCount, 0);
      if (section.itemCount !== descendantCount) {
        throw new ConflictException(
          "Assessment parent section count is inconsistent",
        );
      }
    }

    const recent = blueprint.lookbackDays
      ? await transaction.exerciseAttempt.findMany({
          where: {
            userId,
            presentedAt: {
              gte: new Date(
                Date.now() - blueprint.lookbackDays * 24 * 60 * 60 * 1_000,
              ),
            },
          },
          select: { exerciseRevisionId: true },
          distinct: ["exerciseRevisionId"],
        })
      : [];
    const recentIds = new Set(recent.map((item) => item.exerciseRevisionId));
    const validationLevels =
      blueprint.blueprint.purpose === "DIAGNOSTIC" ||
      blueprint.blueprint.purpose === "PLACEMENT"
        ? (["SUMMATIVE_VERIFIED"] as const)
        : blueprint.blueprint.purpose === "BOOK_CHECKPOINT"
          ? (["FORMATIVE_VERIFIED", "SUMMATIVE_VERIFIED"] as const)
          : ([
              "PRACTICE_ONLY",
              "FORMATIVE_VERIFIED",
              "SUMMATIVE_VERIFIED",
            ] as const);
    const pool = await transaction.exerciseRevision.findMany({
      where: {
        releaseId: blueprint.releaseId,
        status: "PUBLISHED",
        validationLevel: { in: [...validationLevels] },
      },
      include: {
        choices: true,
        learningObjectiveRevision: { include: { subjects: true } },
      },
    });
    const candidates = [...pool].sort((left, right) =>
      orderBySeed(seed, left.id).localeCompare(orderBySeed(seed, right.id)),
    );
    const candidateTargets = new Map(
      candidates.map((exercise) => [
        exercise.id,
        new Set(
          exercise.learningObjectiveRevision.subjects.map((subject) =>
            targetKey(subject.targetKind, subject.targetId),
          ),
        ),
      ]),
    );
    const scopeTargets = new Map<string, Set<string>>();
    const rules = blueprint.sections
      .flatMap((section) => section.rules.map((rule) => ({ section, rule })))
      .sort(
        (left, right) =>
          left.section.position - right.section.position ||
          left.rule.position - right.rule.position,
      );
    for (const { rule } of rules.filter(
      (item) => item.rule.ruleKind === "SCOPE",
    )) {
      if (!rule.scopeKind || !rule.scopeId) {
        throw new ConflictException("Assessment scope rule is incomplete");
      }
      if (rule.scopeKind === "BOOK_EDITION") {
        const items = await transaction.vocabularyBookItem.findMany({
          where: {
            editionId: rule.scopeId,
            releaseId: blueprint.releaseId,
          },
          select: { targetKind: true, targetId: true },
        });
        scopeTargets.set(
          rule.id,
          new Set(
            items.map((item) => targetKey(item.targetKind, item.targetId)),
          ),
        );
      } else if (rule.scopeKind === "PROFICIENCY_LEVEL") {
        const claims = await transaction.proficiencyClaim.findMany({
          where: { releaseId: blueprint.releaseId, levelId: rule.scopeId },
          select: { targetKind: true, targetId: true },
        });
        scopeTargets.set(
          rule.id,
          new Set(
            claims.map((claim) => targetKey(claim.targetKind, claim.targetId)),
          ),
        );
      } else {
        throw new ConflictException("Assessment scope kind is unsupported");
      }
    }

    const selected: SelectedExercise[] = [];
    const used = new Set<string>();
    const descendants = (sectionId: string): BlueprintSection[] =>
      leaves.filter((leaf) =>
        ancestorsByLeaf
          .get(leaf.id)
          ?.some((ancestor) => ancestor.id === sectionId),
      );
    const appliesToLeaf = (sectionId: string, leafId: string): boolean =>
      ancestorsByLeaf
        .get(leafId)
        ?.some((ancestor) => ancestor.id === sectionId) ?? false;
    const selectedForSection = (sectionId: string): SelectedExercise[] =>
      selected.filter((item) => appliesToLeaf(sectionId, item.section.id));
    const quotaMatches = (
      exercise: CandidateExercise,
      rule: SelectionRule,
    ): boolean => {
      switch (rule.dimension) {
        case "KNOWLEDGE_FACET":
          return (
            exercise.learningObjectiveRevision.knowledgeFacet === rule.value
          );
        case "RETRIEVAL_DIRECTION":
          return (
            exercise.learningObjectiveRevision.retrievalDirection === rule.value
          );
        case "TASK_KIND":
          return exercise.exerciseTaskKind === rule.value;
        case "EVIDENCE_KIND":
          return exercise.evidenceKind === rule.value;
        case "RESPONSE_KIND":
          return exercise.responseKind === rule.value;
        case "DIFFICULTY_TIER":
          return exercise.authoredDifficultyTier === rule.value;
        default:
          throw new ConflictException(
            "Assessment quota dimension is unsupported",
          );
      }
    };
    const quotaCount = (sectionId: string, rule: SelectionRule): number =>
      selectedForSection(sectionId).filter((item) =>
        quotaMatches(item.exercise, rule),
      ).length;
    const eligibleForLeaf = (
      exercise: CandidateExercise,
      leaf: BlueprintSection,
    ): boolean => {
      const targetSet = candidateTargets.get(exercise.id)!;
      return (ancestorsByLeaf.get(leaf.id) ?? []).every((section) =>
        section.rules
          .filter((rule) => rule.ruleKind === "SCOPE")
          .every((rule) => {
            const allowed = scopeTargets.get(rule.id);
            return (
              allowed !== undefined &&
              [...targetSet].some((key) => allowed.has(key))
            );
          }),
      );
    };
    const canPlace = (
      exercise: CandidateExercise,
      leaf: BlueprintSection,
      allowRecent = false,
    ): boolean => {
      if (used.has(exercise.id)) return false;
      if (!allowRecent && recentIds.has(exercise.id)) return false;
      if (
        selected.filter((item) => item.section.id === leaf.id).length >=
        leaf.itemCount
      ) {
        return false;
      }
      if (!eligibleForLeaf(exercise, leaf)) return false;
      return rules
        .filter(
          ({ section, rule }) =>
            rule.ruleKind === "QUOTA" &&
            rule.maxCount !== null &&
            appliesToLeaf(section.id, leaf.id) &&
            quotaMatches(exercise, rule),
        )
        .every(
          ({ section, rule }) => quotaCount(section.id, rule) < rule.maxCount!,
        );
    };
    const place = (exercise: CandidateExercise, leaf: BlueprintSection) => {
      selected.push({ section: leaf, exercise });
      used.add(exercise.id);
    };

    for (const { section, rule } of rules.filter(
      (item) => item.rule.ruleKind === "PINNED_ITEM",
    )) {
      if (!rule.exerciseRevisionId) {
        throw new ConflictException(
          "Assessment pinned-item rule is incomplete",
        );
      }
      const exercise = candidates.find(
        (item) => item.id === rule.exerciseRevisionId,
      );
      const leaf = exercise
        ? descendants(section.id).find((item) => canPlace(exercise, item, true))
        : undefined;
      if (!exercise || !leaf) {
        throw new ConflictException("Assessment pinned item is unavailable");
      }
      place(exercise, leaf);
    }

    for (const { section, rule } of rules.filter(
      (item) => item.rule.ruleKind === "QUOTA" && item.rule.minCount !== null,
    )) {
      while (quotaCount(section.id, rule) < rule.minCount!) {
        let placed = false;
        for (const leaf of descendants(section.id)) {
          const exercise = candidates.find(
            (item) => quotaMatches(item, rule) && canPlace(item, leaf),
          );
          if (exercise) {
            place(exercise, leaf);
            placed = true;
            break;
          }
        }
        if (!placed) {
          throw new ConflictException("Assessment quota cannot be satisfied");
        }
      }
    }

    for (const leaf of leaves) {
      while (
        selected.filter((item) => item.section.id === leaf.id).length <
        leaf.itemCount
      ) {
        const exercise = candidates.find((item) => canPlace(item, leaf));
        if (!exercise) {
          throw new ConflictException("Assessment pool is incomplete");
        }
        place(exercise, leaf);
      }
    }
    for (const { section, rule } of rules.filter(
      (item) => item.rule.ruleKind === "QUOTA",
    )) {
      const count = quotaCount(section.id, rule);
      if (
        (rule.minCount !== null && count < rule.minCount) ||
        (rule.maxCount !== null && count > rule.maxCount)
      ) {
        throw new ConflictException("Assessment quota validation failed");
      }
    }
    return selected.sort(
      (left, right) =>
        left.section.position - right.section.position ||
        orderBySeed(seed, left.exercise.id).localeCompare(
          orderBySeed(seed, right.exercise.id),
        ),
    );
  }
}
