import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma, type SylisDatabase } from "@sylis/database";
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
  status: "SUBMITTED",
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
      $queryRaw: vi.fn(async () => [{ id: attemptId, status: "SUBMITTED" }]),
      idempotencyRecord: {
        findUnique: vi.fn(async () => ({
          requestHash:
            "5c609994757cfb065669608561157d9d67f50bd674b81c727830ac10ec7f5809",
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
    ).resolves.toMatchObject({ attemptId, status: "SUBMITTED", correct: true });
    expect(transaction.attemptSelectedChoice.createMany).not.toHaveBeenCalled();
    expect(transaction.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it("scores an exact choice response and stores its idempotency record", async () => {
    const transaction = {
      exerciseAttempt: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ assessmentSessionItem: null })
          .mockResolvedValueOnce(submittedAttempt()),
        findUniqueOrThrow: vi.fn(async () => ({
          exerciseRevision: {
            responseKind: "CHOICE",
            maxScore: new Prisma.Decimal(1),
            responseConfig: { minSelections: 1, maxSelections: 1 },
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
      $queryRaw: vi.fn(async () => [{ id: attemptId, status: "PRESENTED" }]),
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
        status: "SUBMITTED",
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
            maxScore: new Prisma.Decimal(1),
            responseConfig: null,
            choices: [],
            correctChoices: [],
            acceptedTexts: [],
            feedback: [],
          },
          presentedChoices: [],
        })),
      },
      $queryRaw: vi.fn(async () => [{ id: attemptId, status: "PRESENTED" }]),
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
