import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AssessmentSessionStatus,
  AttemptStatus,
  AttemptTextRetentionMode,
  AttemptTextResponsePurpose,
  ConsentDataCategory,
  ConsentDecision,
  ConsentPurpose,
  ExerciseCapturePolicy,
  ExerciseAttemptContextKind,
  ExerciseGradingMode,
  ExerciseResponseKind,
  Prisma,
  RevisionStatus,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

import { normalizeShortText } from "./short-text-normalization";
import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import {
  MATERIAL_BLOCK_INCLUDE,
  projectMaterialBlock,
  projectStimulusBlock,
  STIMULUS_BLOCK_INCLUDE,
} from "../../../platform/database/learning-content-projection";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import type {
  CreateStudyAttemptDto,
  SubmitExerciseResponseDto,
} from "../dto/exercises.dto";

const responseHash = (input: SubmitExerciseResponseDto): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        responseKind: input.responseKind,
        choiceIds: [...new Set(input.choiceIds ?? [])].sort(),
        text: input.text ?? null,
        selfReported: input.selfReported ?? null,
        revealAcknowledged: input.revealAcknowledged ?? null,
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
        )::text
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
          releaseId: planItem.releaseId,
          learningObjectiveRevisionId: planItem.objectiveRevisionId,
          status: RevisionStatus.PUBLISHED,
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
          releaseId: planItem.releaseId,
          exerciseRevisionId: exercise.id,
          dailyStudyPlanItemId: planItem.id,
          contextKind: ExerciseAttemptContextKind.STUDY,
          attemptNo: previousAttempts + 1,
          maxScore: exercise.maxScore,
          idempotencyKey,
        },
      });
      if (order.length > 0) {
        await transaction.attemptPresentedChoice.createMany({
          data: order.map((choiceId, position) => ({
            releaseId: planItem.releaseId,
            attemptId: id,
            exerciseRevisionId: exercise.id,
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
        status: AssessmentSessionStatus;
        expiresAt: Date | null;
      } | null = null;
      if (context.assessmentSessionItem) {
        const sessions = await transaction.$queryRaw<
          Array<{
            id: string;
            status: AssessmentSessionStatus;
            expiresAt: Date | null;
          }>
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
        Array<{ id: string; status: AttemptStatus }>
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
        (assessmentSession.status !== AssessmentSessionStatus.IN_PROGRESS ||
          (assessmentSession.expiresAt !== null &&
            assessmentSession.expiresAt <= new Date()))
      ) {
        throw new ConflictException("Assessment is not accepting responses");
      }
      if (rows[0].status !== AttemptStatus.PRESENTED) {
        throw new ConflictException("Attempt is already terminal");
      }
      const attempt = await transaction.exerciseAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: {
          exerciseRevision: {
            include: {
              responseConfig: {
                include: {
                  choice: true,
                  shortText: true,
                  extendedText: true,
                  noCapture: true,
                },
              },
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
        if (
          input.text !== undefined ||
          input.selfReported !== undefined ||
          input.revealAcknowledged !== undefined ||
          input.consentRecordId !== undefined ||
          (exercise.gradingMode !== ExerciseGradingMode.EXACT &&
            exercise.gradingMode !== ExerciseGradingMode.WEIGHTED)
        ) {
          throw new UnprocessableEntityException(
            "Response payload does not match choice grading",
          );
        }
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
        const minimum = exercise.responseConfig?.choice?.minSelections ?? 1;
        const maximum = exercise.responseConfig?.choice?.maxSelections ?? 1;
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
        score =
          exercise.gradingMode === ExerciseGradingMode.EXACT
            ? correct
              ? exercise.maxScore
              : new Prisma.Decimal(0)
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
          data: selected.map((choiceId) => ({
            releaseId: attempt.releaseId,
            attemptId,
            exerciseRevisionId: attempt.exerciseRevisionId,
            choiceId,
          })),
        });
      } else if (
        input.responseKind === "SHORT_TEXT" ||
        input.responseKind === "EXTENDED_TEXT"
      ) {
        if (
          !input.text?.trim() ||
          (input.choiceIds !== undefined && input.choiceIds.length > 0)
        ) {
          throw new UnprocessableEntityException(
            "Text response does not match the exercise",
          );
        }
        const shortTextConfig =
          input.responseKind === ExerciseResponseKind.SHORT_TEXT
            ? exercise.responseConfig?.shortText
            : null;
        const extendedTextConfig =
          input.responseKind === ExerciseResponseKind.EXTENDED_TEXT
            ? exercise.responseConfig?.extendedText
            : null;
        if (
          (input.responseKind === ExerciseResponseKind.SHORT_TEXT &&
            !shortTextConfig) ||
          (input.responseKind === ExerciseResponseKind.EXTENDED_TEXT &&
            !extendedTextConfig)
        ) {
          throw new ConflictException(
            "Text response configuration is unavailable",
          );
        }
        const capturePolicy =
          shortTextConfig?.capturePolicy ?? extendedTextConfig!.capturePolicy;
        const shouldRetain = input.consentRecordId !== undefined;
        if (capturePolicy === ExerciseCapturePolicy.REQUIRED && !shouldRetain) {
          throw new ForbiddenException("Text retention consent is required");
        }
        const consent = shouldRetain
          ? await transaction.consentRecord.findFirst({
              where: {
                userId: actor.userId,
                purpose: ConsentPurpose.LEARNING_RESPONSE_RETENTION,
                categories: { has: ConsentDataCategory.LEARNING_RESPONSE },
              },
              orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            })
          : null;
        if (
          shouldRetain &&
          (!consent ||
            consent.id !== input.consentRecordId ||
            consent.decision !== ConsentDecision.GRANTED)
        ) {
          throw new ForbiddenException("Consent is not active");
        }
        const characterCount = [...input.text].length;
        const wordCount = input.text
          .trim()
          .split(/\s+/u)
          .filter(Boolean).length;
        const minCharacters = extendedTextConfig?.minCharacters ?? 1;
        const maxCharacters = extendedTextConfig?.maxCharacters ?? null;
        const minWords = extendedTextConfig?.minWords ?? 0;
        const maxWords = extendedTextConfig?.maxWords ?? null;
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
        const normalizedForHash =
          input.responseKind === ExerciseResponseKind.SHORT_TEXT
            ? normalizeShortText(input.text, shortTextConfig!)
            : input.text.normalize("NFC");
        if (exercise.gradingMode === ExerciseGradingMode.EXACT) {
          if (
            input.responseKind !== ExerciseResponseKind.SHORT_TEXT ||
            !shortTextConfig ||
            input.selfReported !== undefined ||
            input.revealAcknowledged !== undefined
          ) {
            throw new UnprocessableEntityException(
              "Response payload does not match exact text grading",
            );
          }
          const normalized = normalizedForHash;
          correct = exercise.acceptedTexts.some(
            (accepted) =>
              normalizeShortText(accepted.text, shortTextConfig) === normalized,
          );
          score = correct ? exercise.maxScore : new Prisma.Decimal(0);
        } else if (exercise.gradingMode === ExerciseGradingMode.SELF_REPORT) {
          if (
            input.selfReported === undefined ||
            input.revealAcknowledged !== true
          ) {
            throw new UnprocessableEntityException("Self report is required");
          }
          correct = null;
          score = input.selfReported
            ? exercise.maxScore
            : new Prisma.Decimal(0);
          await transaction.attemptSelfReport.create({
            data: {
              releaseId: attempt.releaseId,
              attemptId,
              reportedCorrect: input.selfReported,
            },
          });
        } else {
          throw new ConflictException("Text grading mode is unsupported");
        }
        const encrypted = shouldRetain
          ? this.encryption.encrypt(input.text, `exercise-attempt:${attemptId}`)
          : null;
        await transaction.attemptTextResponse.create({
          data: {
            releaseId: attempt.releaseId,
            attemptId,
            retentionMode: encrypted
              ? AttemptTextRetentionMode.ENCRYPTED_CONTENT
              : AttemptTextRetentionMode.HASH_ONLY,
            ciphertext: encrypted?.ciphertext,
            keyVersion: encrypted?.keyVersion,
            purpose: AttemptTextResponsePurpose.EXERCISE_RESPONSE,
            consentRecordId: consent?.id,
            normalizedHash: createHash("sha256")
              .update(normalizedForHash)
              .digest("hex"),
          },
        });
      } else {
        if (
          input.selfReported === undefined ||
          input.revealAcknowledged !== true ||
          input.text !== undefined ||
          input.consentRecordId !== undefined ||
          (input.choiceIds !== undefined && input.choiceIds.length > 0) ||
          exercise.gradingMode !== ExerciseGradingMode.SELF_REPORT
        ) {
          throw new UnprocessableEntityException("Self report is required");
        }
        correct = null;
        score = input.selfReported ? exercise.maxScore : new Prisma.Decimal(0);
        await transaction.attemptSelfReport.create({
          data: {
            releaseId: attempt.releaseId,
            attemptId,
            reportedCorrect: input.selfReported,
          },
        });
      }
      await transaction.exerciseAttempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.SUBMITTED,
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
      where: { id: attemptId, userId, status: AttemptStatus.SUBMITTED },
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
            responseConfig: {
              include: {
                choice: true,
                shortText: true,
                extendedText: true,
                noCapture: true,
              },
            },
            stimuli: {
              orderBy: { position: "asc" },
              include: {
                stimulusRevision: {
                  include: {
                    blocks: {
                      orderBy: { position: "asc" },
                      include: STIMULUS_BLOCK_INCLUDE,
                    },
                  },
                },
              },
            },
            rubrics: { orderBy: { position: "asc" } },
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
      block.materialBlocks.map((material) => material.materialRevisionId),
    );
    const materials = await this.database.pedagogicalMaterialRevision.findMany({
      where: { releaseId: exercise.releaseId, id: { in: materialRevisionIds } },
      include: {
        blocks: {
          orderBy: { position: "asc" },
          include: MATERIAL_BLOCK_INCLUDE,
        },
      },
    });
    const materialById = new Map(
      materials.map((material) => [
        material.id,
        {
          id: material.id,
          kind: material.kind,
          learningLanguageTag: material.learningLanguageTag,
          supportLanguageTag: material.supportLanguageTag,
          blocks: material.blocks.map(projectMaterialBlock),
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
        gradingMode: exercise.gradingMode,
        validationLevel: exercise.validationLevel,
        prompt: {
          languageTag: exercise.promptLanguageTag,
          text: exercise.promptText,
        },
        instructions: exercise.instructions,
        maxScore: exercise.maxScore.toNumber(),
        responseConfig:
          exercise.responseKind === ExerciseResponseKind.CHOICE
            ? exercise.responseConfig?.choice
              ? {
                  responseKind: ExerciseResponseKind.CHOICE,
                  minSelections: exercise.responseConfig.choice.minSelections,
                  maxSelections: exercise.responseConfig.choice.maxSelections,
                }
              : null
            : exercise.responseKind === ExerciseResponseKind.SHORT_TEXT
              ? exercise.responseConfig?.shortText
                ? {
                    responseKind: ExerciseResponseKind.SHORT_TEXT,
                    caseSensitive:
                      exercise.responseConfig.shortText.caseSensitive,
                    diacriticPolicy:
                      exercise.responseConfig.shortText.diacriticPolicy,
                    whitespacePolicy:
                      exercise.responseConfig.shortText.whitespacePolicy,
                    capturePolicy:
                      exercise.responseConfig.shortText.capturePolicy,
                  }
                : null
              : exercise.responseKind === ExerciseResponseKind.EXTENDED_TEXT
                ? exercise.responseConfig?.extendedText
                  ? {
                      responseKind: ExerciseResponseKind.EXTENDED_TEXT,
                      expectedLanguageTag:
                        exercise.responseConfig.extendedText
                          .expectedLanguageTag,
                      minCharacters:
                        exercise.responseConfig.extendedText.minCharacters,
                      maxCharacters:
                        exercise.responseConfig.extendedText.maxCharacters,
                      minWords: exercise.responseConfig.extendedText.minWords,
                      maxWords: exercise.responseConfig.extendedText.maxWords,
                      capturePolicy:
                        exercise.responseConfig.extendedText.capturePolicy,
                    }
                  : null
                : exercise.responseConfig?.noCapture
                  ? { responseKind: ExerciseResponseKind.NO_CAPTURE }
                  : null,
        rubrics: exercise.rubrics.map((rubric) => ({
          id: rubric.id,
          criterionKey: rubric.criterionKey,
          languageTag: rubric.languageTag,
          description: rubric.description,
          maxScore: rubric.maxScore.toNumber(),
        })),
        stimuli: exercise.stimuli.map((stimulus) => ({
          ...stimulus,
          stimulusRevision: {
            ...stimulus.stimulusRevision,
            blocks: stimulus.stimulusRevision.blocks.map((block) => {
              const projected = projectStimulusBlock(block);
              return {
                ...projected,
                material: projected.materialRevisionId
                  ? (materialById.get(projected.materialRevisionId) ?? null)
                  : null,
              };
            }),
          },
        })),
        choices: attempt.presentedChoices.map((item) => item.choice),
      },
    };
  }
}
