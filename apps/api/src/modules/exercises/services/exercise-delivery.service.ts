import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, type PrismaTypes, type SylisDatabase } from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import type {
  CreateStudyAttemptDto,
  SubmitExerciseResponseDto,
} from "../dto/exercises.dto";

const normalizedText = (value: string): string =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

const responseHash = (input: SubmitExerciseResponseDto): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        responseKind: input.responseKind,
        choiceIds: [...new Set(input.choiceIds ?? [])].sort(),
        text: input.text ?? null,
        selfReported: input.selfReported ?? null,
        consentRecordId: input.consentRecordId ?? null,
      }),
    )
    .digest("hex");

const stableChoiceOrder = (attemptId: string, choiceIds: string[]): string[] =>
  [...choiceIds].sort((left, right) =>
    createHash("sha256")
      .update(`${attemptId}:${left}`)
      .digest("hex")
      .localeCompare(
        createHash("sha256").update(`${attemptId}:${right}`).digest("hex"),
      ),
  );

@Injectable()
export class ExerciseDeliveryService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: FieldEncryptionService,
  ) {}

  async createStudyAttempt(
    actor: ActorContext,
    input: CreateStudyAttemptDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new ConflictException("Idempotency-Key is required");
    }
    const attemptId = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`study-attempt:${actor.userId}:${idempotencyKey}`}, 0)
        )
      `);
      const existing = await transaction.exerciseAttempt.findFirst({
        where: { userId: actor.userId, idempotencyKey },
      });
      if (existing) {
        if (existing.dailyStudyPlanItemId !== input.planItemId) {
          throw new ConflictException(
            "Idempotency key reused with different input",
          );
        }
        return existing.id;
      }
      const lockedPlanItems = await transaction.$queryRaw<
        Array<{ id: string }>
      >(
        Prisma.sql`
          SELECT item.id
          FROM "DailyStudyPlanItem" item
          JOIN "DailyStudyPlan" plan ON plan.id = item."planId"
          WHERE item.id = ${input.planItemId}::uuid
            AND plan."userId" = ${actor.userId}::uuid
          FOR UPDATE OF item
        `,
      );
      if (!lockedPlanItems[0]) throw new NotFoundException();
      const planItem = await transaction.dailyStudyPlanItem.findUniqueOrThrow({
        where: { id: input.planItemId },
      });
      const exercises = await transaction.exerciseRevision.findMany({
        where: {
          learningObjectiveRevisionId: planItem.objectiveRevisionId,
          status: "PUBLISHED",
        },
        include: { choices: true },
        orderBy: { contentHash: "asc" },
      });
      if (exercises.length === 0) {
        throw new ConflictException("No published exercise for objective");
      }
      const previousAttempts = await transaction.exerciseAttempt.count({
        where: {
          userId: actor.userId,
          dailyStudyPlanItemId: planItem.id,
        },
      });
      const exercise = exercises[previousAttempts % exercises.length]!;
      const id = randomUUID();
      const order = stableChoiceOrder(
        id,
        exercise.choices.map((choice) => choice.id),
      );
      await transaction.exerciseAttempt.create({
        data: {
          id,
          userId: actor.userId,
          exerciseRevisionId: exercise.id,
          dailyStudyPlanItemId: planItem.id,
          contextKind: "STUDY",
          attemptNo: previousAttempts + 1,
          maxScore: exercise.maxScore,
          idempotencyKey,
        },
      });
      if (order.length > 0) {
        await transaction.attemptPresentedChoice.createMany({
          data: order.map((choiceId, position) => ({
            attemptId: id,
            choiceId,
            position,
          })),
        });
      }
      return id;
    });
    return this.deliver(attemptId, actor.userId);
  }

  async submit(
    actor: ActorContext,
    attemptId: string,
    input: SubmitExerciseResponseDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new ConflictException("Idempotency-Key is required");
    }
    const operation = `exercise-response:${attemptId}`;
    const requestHash = responseHash(input);
    return this.database.$transaction(async (transaction) => {
      const context = await transaction.exerciseAttempt.findFirst({
        where: { id: attemptId, userId: actor.userId },
        select: {
          assessmentSessionItem: {
            select: { sessionId: true },
          },
        },
      });
      if (!context) throw new NotFoundException();
      let assessmentSession: {
        id: string;
        status: string;
        expiresAt: Date | null;
      } | null = null;
      if (context.assessmentSessionItem) {
        const sessions = await transaction.$queryRaw<
          Array<{ id: string; status: string; expiresAt: Date | null }>
        >(Prisma.sql`
          SELECT id, status, "expiresAt"
          FROM "AssessmentSession"
          WHERE id = ${context.assessmentSessionItem.sessionId}::uuid
            AND "userId" = ${actor.userId}::uuid
          FOR UPDATE
        `);
        assessmentSession = sessions[0] ?? null;
        if (!assessmentSession) throw new NotFoundException();
      }
      const rows = await transaction.$queryRaw<
        Array<{ id: string; status: string }>
      >(
        Prisma.sql`
          SELECT id, status
          FROM "ExerciseAttempt"
          WHERE id = ${attemptId}::uuid AND "userId" = ${actor.userId}::uuid
          FOR UPDATE
        `,
      );
      if (!rows[0]) throw new NotFoundException();
      const replay = await transaction.idempotencyRecord.findUnique({
        where: {
          actorId_operation_key: {
            actorId: actor.userId,
            operation,
            key: idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new ConflictException(
            "Idempotency key reused with different input",
          );
        }
        return this.submittedResult(transaction, attemptId, actor.userId);
      }
      if (
        assessmentSession &&
        (assessmentSession.status !== "IN_PROGRESS" ||
          (assessmentSession.expiresAt !== null &&
            assessmentSession.expiresAt <= new Date()))
      ) {
        throw new ConflictException("Assessment is not accepting responses");
      }
      if (rows[0].status !== "PRESENTED") {
        throw new ConflictException("Attempt is already terminal");
      }
      const attempt = await transaction.exerciseAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: {
          exerciseRevision: {
            include: {
              responseConfig: true,
              choices: true,
              correctChoices: true,
              acceptedTexts: true,
              feedback: true,
            },
          },
          presentedChoices: true,
        },
      });
      const exercise = attempt.exerciseRevision;
      if (exercise.responseKind !== input.responseKind) {
        throw new UnprocessableEntityException(
          "Response kind does not match exercise",
        );
      }

      let score = new Prisma.Decimal(0);
      let correct: boolean | null = null;
      if (input.responseKind === "CHOICE") {
        const selected = [...new Set(input.choiceIds ?? [])];
        const presented = new Set(
          attempt.presentedChoices.map((item) => item.choiceId),
        );
        if (
          selected.length === 0 ||
          selected.some((id) => !presented.has(id))
        ) {
          throw new UnprocessableEntityException("Choice was not presented");
        }
        const selectedRows = exercise.choices.filter((choice) =>
          selected.includes(choice.id),
        );
        const minimum = exercise.responseConfig?.minSelections ?? 1;
        const maximum = exercise.responseConfig?.maxSelections ?? 1;
        if (selected.length < minimum || selected.length > maximum) {
          throw new UnprocessableEntityException(
            `Expected between ${minimum} and ${maximum} selections`,
          );
        }
        const correctIds = new Set(
          exercise.correctChoices.map((choice) => choice.choiceId),
        );
        correct =
          selectedRows.length === correctIds.size &&
          selectedRows.every((choice) => correctIds.has(choice.id));
        score = correct
          ? exercise.maxScore
          : selectedRows.reduce(
              (total, choice) =>
                total.add(
                  exercise.correctChoices.find(
                    (response) => response.choiceId === choice.id,
                  )?.weight ?? 0,
                ),
              new Prisma.Decimal(0),
            );
        if (score.lessThan(0)) score = new Prisma.Decimal(0);
        if (score.greaterThan(exercise.maxScore)) score = exercise.maxScore;
        await transaction.attemptSelectedChoice.createMany({
          data: selected.map((choiceId) => ({ attemptId, choiceId })),
        });
      } else if (
        input.responseKind === "SHORT_TEXT" ||
        input.responseKind === "EXTENDED_TEXT"
      ) {
        if (!input.text || !input.consentRecordId) {
          throw new UnprocessableEntityException(
            "Text and consent are required",
          );
        }
        const consent = await transaction.consentRecord.findFirst({
          where: { userId: actor.userId, purpose: "PERSONALIZATION" },
          orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
        });
        if (
          consent?.id !== input.consentRecordId ||
          consent.decision !== "GRANTED"
        ) {
          throw new ForbiddenException("Consent is not active");
        }
        const characterCount = [...input.text].length;
        const wordCount = input.text
          .trim()
          .split(/\s+/u)
          .filter(Boolean).length;
        const responseConfig = exercise.responseConfig;
        const minCharacters = responseConfig?.minCharacters;
        const maxCharacters = responseConfig?.maxCharacters;
        const minWords = responseConfig?.minWords;
        const maxWords = responseConfig?.maxWords;
        if (
          (minCharacters !== null &&
            minCharacters !== undefined &&
            characterCount < minCharacters) ||
          (maxCharacters !== null &&
            maxCharacters !== undefined &&
            characterCount > maxCharacters) ||
          (minWords !== null &&
            minWords !== undefined &&
            wordCount < minWords) ||
          (maxWords !== null && maxWords !== undefined && wordCount > maxWords)
        ) {
          throw new UnprocessableEntityException(
            "Text response does not satisfy the exercise constraints",
          );
        }
        const normalized = normalizedText(input.text);
        correct =
          input.responseKind === "SHORT_TEXT"
            ? exercise.acceptedTexts.some(
                (accepted) => accepted.normalizedText === normalized,
              )
            : null;
        score = correct === true ? exercise.maxScore : new Prisma.Decimal(0);
        const encrypted = this.encryption.encrypt(
          input.text,
          `exercise-attempt:${attemptId}`,
        );
        await transaction.attemptTextResponse.create({
          data: {
            attemptId,
            ciphertext: encrypted.ciphertext,
            keyVersion: encrypted.keyVersion,
            purpose: "EXERCISE_RESPONSE",
            consentRecordId: consent.id,
            normalizedHash: createHash("sha256")
              .update(normalized)
              .digest("hex"),
          },
        });
      } else {
        if (input.selfReported === undefined) {
          throw new UnprocessableEntityException("Self report is required");
        }
        correct = null;
        score = new Prisma.Decimal(0);
        await transaction.attemptSelfReport.create({
          data: {
            attemptId,
            reportedCorrect: input.selfReported,
          },
        });
      }
      await transaction.exerciseAttempt.update({
        where: { id: attemptId },
        data: {
          status: "SUBMITTED",
          score,
          correct,
          submittedAt: new Date(),
        },
      });
      await transaction.idempotencyRecord.create({
        data: {
          actorId: actor.userId,
          operation,
          key: idempotencyKey,
          requestHash,
          responseRef: attemptId,
          statusCode: 201,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        },
      });
      return this.submittedResult(transaction, attemptId, actor.userId);
    });
  }

  private async submittedResult(
    database: SylisDatabase | PrismaTypes.TransactionClient,
    attemptId: string,
    userId: string,
  ) {
    const attempt = await database.exerciseAttempt.findFirst({
      where: { id: attemptId, userId, status: "SUBMITTED" },
      include: {
        exerciseRevision: { include: { feedback: true } },
        selfReport: true,
      },
    });
    if (!attempt) throw new ConflictException("Attempt result is unavailable");
    return {
      attemptId,
      status: attempt.status,
      score: attempt.score?.toNumber() ?? 0,
      maxScore: attempt.maxScore.toNumber(),
      correct: attempt.correct,
      selfReported: attempt.selfReport?.reportedCorrect ?? null,
      feedback: attempt.exerciseRevision.feedback,
    };
  }

  async deliver(attemptId: string, userId: string) {
    const attempt = await this.database.exerciseAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        exerciseRevision: {
          include: {
            responseConfig: true,
            stimuli: {
              orderBy: { position: "asc" },
              include: { stimulusRevision: { include: { blocks: true } } },
            },
          },
        },
        presentedChoices: {
          orderBy: { position: "asc" },
          include: {
            choice: { select: { id: true, languageTag: true, text: true } },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException();
    const exercise = attempt.exerciseRevision;
    const stimulusBlocks = exercise.stimuli.flatMap(
      (stimulus) => stimulus.stimulusRevision.blocks,
    );
    const materialRevisionIds = stimulusBlocks.flatMap((block) =>
      block.materialRevisionId ? [block.materialRevisionId] : [],
    );
    const materials = await this.database.pedagogicalMaterialRevision.findMany({
      where: { releaseId: exercise.releaseId, id: { in: materialRevisionIds } },
      include: { blocks: { orderBy: { position: "asc" } } },
    });
    const materialBlocks = materials.flatMap((material) => material.blocks);
    const allContentBlocks = [...stimulusBlocks, ...materialBlocks];
    const exampleIds = allContentBlocks.flatMap((block) =>
      block.exampleId ? [block.exampleId] : [],
    );
    const mediaIds = allContentBlocks.flatMap((block) =>
      block.mediaAssetId ? [block.mediaAssetId] : [],
    );
    const [examples, media] = await Promise.all([
      this.database.exampleSentence.findMany({
        where: { releaseId: exercise.releaseId, id: { in: exampleIds } },
        select: {
          id: true,
          languageTag: true,
          text: true,
          translations: { select: { id: true, languageTag: true, text: true } },
        },
      }),
      this.database.mediaAsset.findMany({
        where: { releaseId: exercise.releaseId, id: { in: mediaIds } },
        select: {
          id: true,
          mediaType: true,
          mimeType: true,
          contentUri: true,
          durationMs: true,
        },
      }),
    ]);
    const examplesById = new Map(
      examples.map((example) => [example.id, example]),
    );
    const mediaById = new Map(media.map((asset) => [asset.id, asset]));
    const materialById = new Map(
      materials.map((material) => [
        material.id,
        {
          id: material.id,
          kind: material.kind,
          learningLanguageTag: material.learningLanguageTag,
          supportLanguageTag: material.supportLanguageTag,
          blocks: material.blocks.map((block) => ({
            ...block,
            example: block.exampleId
              ? (examplesById.get(block.exampleId) ?? null)
              : null,
            media: block.mediaAssetId
              ? (mediaById.get(block.mediaAssetId) ?? null)
              : null,
          })),
        },
      ]),
    );
    return {
      id: attempt.id,
      status: attempt.status,
      presentedAt: attempt.presentedAt,
      exercise: {
        id: exercise.id,
        taskKind: exercise.exerciseTaskKind,
        responseKind: exercise.responseKind,
        responseCardinality: exercise.responseCardinality,
        responsePlacement: exercise.responsePlacement,
        prompt: {
          languageTag: exercise.promptLanguageTag,
          text: exercise.promptText,
        },
        instructions: exercise.instructions,
        maxScore: exercise.maxScore.toNumber(),
        responseConfig: exercise.responseConfig,
        stimuli: exercise.stimuli.map((stimulus) => ({
          ...stimulus,
          stimulusRevision: {
            ...stimulus.stimulusRevision,
            blocks: stimulus.stimulusRevision.blocks.map((block) => ({
              ...block,
              example: block.exampleId
                ? (examplesById.get(block.exampleId) ?? null)
                : null,
              media: block.mediaAssetId
                ? (mediaById.get(block.mediaAssetId) ?? null)
                : null,
              material: block.materialRevisionId
                ? (materialById.get(block.materialRevisionId) ?? null)
                : null,
            })),
          },
        })),
        choices: attempt.presentedChoices.map((item) => item.choice),
      },
    };
  }
}
