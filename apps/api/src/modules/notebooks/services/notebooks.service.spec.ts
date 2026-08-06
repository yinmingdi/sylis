import { NotFoundException } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../../platform/auth/actor-context";
import type { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import type { ActiveReleaseService } from "../../lexicon/services/active-release.service";
import type { LexicalTargetPresentationService } from "../../lexicon/services/lexical-target-presentation.service";
import { NotebooksService } from "./notebooks.service";

const actor: ActorContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
  audience: "USER",
  roles: [],
  authStrength: "PASSWORD",
};
const notebookId = "00000000-0000-4000-8000-000000000002";

const item = (id: string, position: number) => ({
  id,
  notebookId,
  position,
  noteCiphertext: null,
  keyVersion: null,
  tags: [],
});

const databaseWithTransaction = (transaction: Record<string, unknown>) =>
  ({
    $transaction: vi.fn(async (operation: (client: unknown) => unknown) =>
      operation(transaction),
    ),
  }) as unknown as SylisDatabase;

describe("NotebooksService", () => {
  it("locks the notebook and rewrites every position during reorder", async () => {
    const items = [item("item-1", 0), item("item-2", 1), item("item-3", 2)];
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: notebookId }]),
      $executeRaw: vi.fn(async () => 3),
      collectedLexicalItem: {
        findMany: vi.fn(async () => items),
        update: vi.fn(async ({ where }: { where: { id: string } }) =>
          items.find((candidate) => candidate.id === where.id),
        ),
      },
    };
    const service = new NotebooksService(
      databaseWithTransaction(transaction),
      {} as FieldEncryptionService,
      {} as ActiveReleaseService,
      {} as LexicalTargetPresentationService,
    );

    await service.updateItem(actor, notebookId, "item-3", { position: 0 });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(
      transaction.collectedLexicalItem.update.mock.calls.slice(0, 3),
    ).toEqual([
      [{ where: { id: "item-3" }, data: { position: 0 } }],
      [{ where: { id: "item-1" }, data: { position: 1 } }],
      [{ where: { id: "item-2" }, data: { position: 2 } }],
    ]);
  });

  it("does not mutate items when the notebook is not owned by the actor", async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      collectedLexicalItem: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };
    const service = new NotebooksService(
      databaseWithTransaction(transaction),
      {} as FieldEncryptionService,
      {} as ActiveReleaseService,
      {} as LexicalTargetPresentationService,
    );

    await expect(
      service.updateItem(actor, notebookId, "item-1", { position: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.collectedLexicalItem.findMany).not.toHaveBeenCalled();
    expect(transaction.collectedLexicalItem.update).not.toHaveBeenCalled();
  });
});
