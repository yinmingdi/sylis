import { NotFoundException } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../../platform/auth/actor-context";
import type { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import type { ActiveReleaseService } from "../../lexicon/services/active-release.service";
import type { LexicalTargetPresentationService } from "../../lexicon/services/lexical-target-presentation.service";
import { ReadingService } from "./reading.service";

const actor: ActorContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
  audience: "USER",
  roles: [],
  authStrength: "PASSWORD",
};

const databaseWithTransaction = (transaction: Record<string, unknown>) =>
  ({
    $transaction: vi.fn(async (operation: (client: unknown) => unknown) =>
      operation(transaction),
    ),
  }) as unknown as SylisDatabase;

const serviceFor = (database: SylisDatabase) =>
  new ReadingService(
    database,
    {} as FieldEncryptionService,
    {} as ActiveReleaseService,
    {} as LexicalTargetPresentationService,
  );

describe("ReadingService", () => {
  it("rejects activity for an inaccessible document before writing events", async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      readingDocument: { findFirst: vi.fn(async () => null) },
      readingActivityEvent: { create: vi.fn() },
      readingActivity: { upsert: vi.fn() },
    };
    const service = serviceFor(databaseWithTransaction(transaction));

    await expect(
      service.recordActivity(actor, {
        documentId: "document-1",
        eventKind: "OPEN",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.readingDocument.findFirst).toHaveBeenCalledWith({
      where: {
        id: "document-1",
        OR: [{ ownerUserId: actor.userId }, { status: "PUBLISHED" }],
        revisions: undefined,
      },
      select: { id: true },
    });
    expect(transaction.readingActivityEvent.create).not.toHaveBeenCalled();
    expect(transaction.readingActivity.upsert).not.toHaveBeenCalled();
  });

  it("forces completed activity to full progress and scopes the revision", async () => {
    const event = { id: "event-1", progress: 1 };
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      readingDocument: {
        findFirst: vi.fn(async () => ({ id: "document-1" })),
      },
      readingActivityEvent: { create: vi.fn(async () => event) },
      readingActivity: { upsert: vi.fn(async () => undefined) },
    };
    const service = serviceFor(databaseWithTransaction(transaction));

    await expect(
      service.recordActivity(actor, {
        documentId: "document-1",
        revisionId: "revision-1",
        eventKind: "COMPLETE",
        progress: 0.4,
        offset: 120,
      }),
    ).resolves.toBe(event);

    expect(transaction.readingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revisions: { some: { id: "revision-1" } },
        }),
      }),
    );
    expect(transaction.readingActivityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ progress: 1, eventKind: "COMPLETE" }),
    });
    expect(transaction.readingActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ progress: 1 }),
        update: expect.objectContaining({
          progress: 1,
          completedAt: expect.any(Date),
        }),
      }),
    );
  });
});
