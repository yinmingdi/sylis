import { ConflictException, ForbiddenException } from "@nestjs/common";
import {
  AttemptStatus,
  AttemptTextRetentionMode,
  ExerciseCapturePolicy,
  ExerciseGradingMode,
  Prisma,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../../platform/auth/actor-context";
import type { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import { ExerciseDeliveryService } from "./exercise-delivery.service";

const actor: ActorContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
  audience: "USER",
  roles: [],
  authStrength: "PASSWORD",
};
const attemptId = "00000000-0000-4000-8000-000000000002";

const databaseWithTransaction = (transaction: Record<string, unknown>) =>
  ({
    $transaction: vi.fn(async (operation: (client: unknown) => unknown) =>
      operation(transaction),
    ),
  }) as unknown as SylisDatabase;

const submittedAttempt = () => ({
  status: AttemptStatus.SUBMITTED,
  score: new Prisma.Decimal(1),
  maxScore: new Prisma.Decimal(1),
  correct: true,
  selfReport: null,
  exerciseRevision: { feedback: [{ outcome: "CORRECT", text: "Good" }] },
});

describe("ExerciseDeliveryService", () => {
  it("replays an identical submitted response without scoring it twice", async () => {
    const transaction = {
      exerciseAttempt: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ assessmentSessionItem: null })
          .mockResolvedValueOnce(submittedAttempt()),
      },
      $queryRaw: vi.fn(async () => [
        { id: attemptId, status: AttemptStatus.SUBMITTED },
      ]),
      idempotencyRecord: {
        findUnique: vi.fn(async () => ({
          requestHash:
            "e2a9e0e986f75d65a031a64414737cc4f300f9f6c8eeab09252baec27b4c1b24",
        })),
        create: vi.fn(),
      },
      attemptSelectedChoice: { createMany: vi.fn() },
    };
    const service = new ExerciseDeliveryService(
      databaseWithTransaction(transaction),
      {} as FieldEncryptionService,
    );

    await expect(
      service.submit(
        actor,
        attemptId,
        { responseKind: "CHOICE", choiceIds: ["choice-1"] },
        "request-1",
      ),
    ).resolves.toMatchObject({
      attemptId,
      status: AttemptStatus.SUBMITTED,
      correct: true,
    });
    expect(transaction.attemptSelectedChoice.createMany).not.toHaveBeenCalled();
    expect(transaction.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it("LEARNING-001-UNIT scores an exact choice response and stores its idempotency record", async () => {
    const transaction = {
      exerciseAttempt: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ assessmentSessionItem: null })
          .mockResolvedValueOnce(submittedAttempt()),
        findUniqueOrThrow: vi.fn(async () => ({
          exerciseRevision: {
            responseKind: "CHOICE",
            gradingMode: ExerciseGradingMode.EXACT,
            maxScore: new Prisma.Decimal(1),
            responseConfig: {
              choice: { minSelections: 1, maxSelections: 1 },
            },
            choices: [{ id: "choice-1" }, { id: "choice-2" }],
            correctChoices: [
              { choiceId: "choice-1", weight: new Prisma.Decimal(1) },
            ],
            acceptedTexts: [],
            feedback: [],
          },
          presentedChoices: [
            { choiceId: "choice-1" },
            { choiceId: "choice-2" },
          ],
        })),
        update: vi.fn(async () => undefined),
      },
      $queryRaw: vi.fn(async () => [
        { id: attemptId, status: AttemptStatus.PRESENTED },
      ]),
      idempotencyRecord: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => undefined),
      },
      attemptSelectedChoice: { createMany: vi.fn(async () => undefined) },
    };
    const service = new ExerciseDeliveryService(
      databaseWithTransaction(transaction),
      {} as FieldEncryptionService,
    );

    const result = await service.submit(
      actor,
      attemptId,
      { responseKind: "CHOICE", choiceIds: ["choice-1"] },
      "request-2",
    );

    expect(result).toMatchObject({ score: 1, maxScore: 1, correct: true });
    expect(transaction.exerciseAttempt.update).toHaveBeenCalledWith({
      where: { id: attemptId },
      data: expect.objectContaining({
        status: AttemptStatus.SUBMITTED,
        score: expect.any(Prisma.Decimal),
        correct: true,
      }),
    });
    expect(transaction.idempotencyRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: actor.userId,
        operation: `exercise-response:${attemptId}`,
        key: "request-2",
        responseRef: attemptId,
      }),
    });
  });

  it("rejects text capture when the supplied consent is not the active grant", async () => {
    const transaction = {
      exerciseAttempt: {
        findFirst: vi.fn(async () => ({ assessmentSessionItem: null })),
        findUniqueOrThrow: vi.fn(async () => ({
          exerciseRevision: {
            responseKind: "SHORT_TEXT",
            gradingMode: ExerciseGradingMode.EXACT,
            maxScore: new Prisma.Decimal(1),
            responseConfig: {
              shortText: {
                caseSensitive: false,
                diacriticPolicy: "PRESERVE",
                whitespacePolicy: "COLLAPSE",
                capturePolicy: ExerciseCapturePolicy.REQUIRED,
              },
            },
            choices: [],
            correctChoices: [],
            acceptedTexts: [],
            feedback: [],
          },
          presentedChoices: [],
        })),
      },
      $queryRaw: vi.fn(async () => [
        { id: attemptId, status: AttemptStatus.PRESENTED },
      ]),
      idempotencyRecord: { findUnique: vi.fn(async () => null) },
      consentRecord: {
        findFirst: vi.fn(async () => ({
          id: "consent-new",
          decision: "GRANTED",
        })),
      },
      attemptTextResponse: { create: vi.fn() },
    };
    const service = new ExerciseDeliveryService(
      databaseWithTransaction(transaction),
      {} as FieldEncryptionService,
    );

    await expect(
      service.submit(
        actor,
        attemptId,
        {
          responseKind: "SHORT_TEXT",
          text: "answer",
          consentRecordId: "consent-old",
        },
        "request-3",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.attemptTextResponse.create).not.toHaveBeenCalled();
  });

  it("stores an optional extended-text response as hash-only and records self grading", async () => {
    const encryption = { encrypt: vi.fn() };
    const transaction = {
      exerciseAttempt: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ assessmentSessionItem: null })
          .mockResolvedValueOnce({
            status: AttemptStatus.SUBMITTED,
            score: new Prisma.Decimal(1),
            maxScore: new Prisma.Decimal(1),
            correct: null,
            selfReport: { reportedCorrect: true },
            exerciseRevision: { feedback: [] },
          }),
        findUniqueOrThrow: vi.fn(async () => ({
          releaseId: "00000000-0000-4000-8000-000000000003",
          exerciseRevisionId: "00000000-0000-4000-8000-000000000004",
          exerciseRevision: {
            responseKind: "EXTENDED_TEXT",
            gradingMode: ExerciseGradingMode.SELF_REPORT,
            maxScore: new Prisma.Decimal(1),
            responseConfig: {
              extendedText: {
                expectedLanguageTag: "en",
                minCharacters: 3,
                maxCharacters: 100,
                minWords: 1,
                maxWords: 20,
                capturePolicy: ExerciseCapturePolicy.OPTIONAL,
              },
            },
            choices: [],
            correctChoices: [],
            acceptedTexts: [],
            feedback: [],
          },
          presentedChoices: [],
        })),
        update: vi.fn(async () => undefined),
      },
      $queryRaw: vi.fn(async () => [
        { id: attemptId, status: AttemptStatus.PRESENTED },
      ]),
      idempotencyRecord: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => undefined),
      },
      consentRecord: { findFirst: vi.fn() },
      attemptSelfReport: { create: vi.fn(async () => undefined) },
      attemptTextResponse: { create: vi.fn(async () => undefined) },
    };
    const service = new ExerciseDeliveryService(
      databaseWithTransaction(transaction),
      encryption as unknown as FieldEncryptionService,
    );

    await expect(
      service.submit(
        actor,
        attemptId,
        {
          responseKind: "EXTENDED_TEXT",
          text: "A useful answer.",
          selfReported: true,
          revealAcknowledged: true,
        },
        "request-extended-self-report",
      ),
    ).resolves.toMatchObject({
      score: 1,
      correct: null,
      selfReported: true,
    });
    expect(encryption.encrypt).not.toHaveBeenCalled();
    expect(transaction.consentRecord.findFirst).not.toHaveBeenCalled();
    expect(transaction.attemptTextResponse.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        retentionMode: AttemptTextRetentionMode.HASH_ONLY,
        ciphertext: undefined,
        keyVersion: undefined,
        consentRecordId: undefined,
        normalizedHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
    expect(transaction.attemptSelfReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reportedCorrect: true,
      }),
    });
    expect(transaction.exerciseAttempt.update).toHaveBeenCalledWith({
      where: { id: attemptId },
      data: expect.objectContaining({
        score: expect.any(Prisma.Decimal),
        correct: null,
      }),
    });
  });

  it("requires an idempotency key before opening a transaction", async () => {
    const database = { $transaction: vi.fn() } as unknown as SylisDatabase;
    const service = new ExerciseDeliveryService(
      database,
      {} as FieldEncryptionService,
    );

    await expect(
      service.submit(actor, attemptId, { responseKind: "NO_CAPTURE" }, ""),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});
