import { createHash } from "node:crypto";

import {
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentCefrLevel,
  AgentReadingGenre,
  type AgentArtifactRevisionSnapshot,
} from "@sylis/agent-contracts";
import {
  DocumentOriginKind,
  DocumentRetentionPolicy,
  DocumentRightsPolicy,
  LexicalAnnotationTargetKind,
  ReadingActivityKind,
  ReadingDocumentStatus,
  ReadingDocumentVisibility,
  TextOffsetUnit,
  type SylisDatabase,
} from "@sylis/database";
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

const serviceFor = (
  database: SylisDatabase,
  dependencies: {
    encryption?: FieldEncryptionService;
    releases?: ActiveReleaseService;
    targetPresentations?: LexicalTargetPresentationService;
  } = {},
) =>
  new ReadingService(
    database,
    dependencies.encryption ?? ({} as FieldEncryptionService),
    dependencies.releases ?? ({} as ActiveReleaseService),
    dependencies.targetPresentations ??
      ({} as LexicalTargetPresentationService),
  );

describe("ReadingService", () => {
  it("publishes one deterministic private Reading revision from an ARTICLE Artifact", async () => {
    const documentUpsert = vi.fn(async ({ create }) => ({
      ...create,
      currentRevisionId: null,
      retiredAt: null,
    }));
    const revisionUpsert = vi.fn(async ({ create }) => ({
      ...create,
      withdrawnAt: null,
    }));
    const transaction = {
      documentOrigin: {
        upsert: vi.fn(async ({ create }) => ({
          id: "00000000-0000-4000-8000-000000000030",
          ...create,
          retiredAt: null,
        })),
      },
      readingDocument: {
        upsert: documentUpsert,
        update: vi.fn(async () => undefined),
      },
      readingDocumentRevision: { upsert: revisionUpsert },
    };
    const encryption = {
      encrypt: vi.fn(() => ({
        ciphertext: new Uint8Array([1, 2, 3]),
        keyVersion: "test-key",
      })),
    } as unknown as FieldEncryptionService;
    const service = serviceFor(databaseWithTransaction(transaction), {
      encryption,
    });
    const artifact = articleArtifact();

    const first = await service.publishAgentArticle(actor, artifact);
    const second = await service.publishAgentArticle(actor, artifact);

    expect(second).toEqual(first);
    expect(transaction.documentOrigin.upsert).toHaveBeenCalledWith({
      where: {
        kind_sourceKey: {
          kind: DocumentOriginKind.AI_GENERATED,
          sourceKey: `agent-artifact-revision:${artifact.revisionId}`,
        },
      },
      create: expect.objectContaining({
        kind: DocumentOriginKind.AI_GENERATED,
        rightsPolicy: DocumentRightsPolicy.PRIVATE_OWNER,
        retentionPolicy: DocumentRetentionPolicy.OWNER_CONTROLLED,
      }),
      update: {},
    });
    expect(documentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ownerUserId: actor.userId,
          externalKey: artifact.revisionId,
          visibility: ReadingDocumentVisibility.PRIVATE,
        }),
      }),
    );
    expect(revisionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          createdAt: expect.any(Date),
          languageTag: "en",
          publishedAt: expect.any(Date),
          title: artifact.title,
          revisionNo: 1,
          wordCount: 11,
        }),
      }),
    );
    const revisionCreate = revisionUpsert.mock.calls[0]![0].create;
    expect(revisionCreate.createdAt).toBe(revisionCreate.publishedAt);
  });

  it("rejects activity for an inaccessible document before writing events", async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      readingDocumentRevision: { findFirst: vi.fn(async () => null) },
      readingProgress: { findUnique: vi.fn(), upsert: vi.fn() },
      readingActivity: { create: vi.fn() },
    };
    const service = serviceFor(databaseWithTransaction(transaction));

    await expect(
      service.recordActivity(actor, {
        documentId: "document-1",
        revisionId: "revision-1",
        kind: ReadingActivityKind.OPEN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.readingDocumentRevision.findFirst).toHaveBeenCalledWith({
      where: {
        id: "revision-1",
        documentId: "document-1",
        document: {
          OR: [
            { ownerUserId: actor.userId },
            {
              status: ReadingDocumentStatus.PUBLISHED,
              visibility: ReadingDocumentVisibility.PUBLIC,
            },
          ],
        },
      },
      select: { id: true, documentId: true },
    });
    expect(transaction.readingActivity.create).not.toHaveBeenCalled();
    expect(transaction.readingProgress.upsert).not.toHaveBeenCalled();
  });

  it("forces completed activity to full progress and scopes the revision", async () => {
    const event = { id: "event-1", progress: 1 };
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      readingDocumentRevision: {
        findFirst: vi.fn(async () => ({ id: "document-1" })),
      },
      readingActivity: { create: vi.fn(async () => event) },
      readingProgress: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => undefined),
      },
    };
    const service = serviceFor(databaseWithTransaction(transaction));

    await expect(
      service.recordActivity(actor, {
        documentId: "document-1",
        revisionId: "revision-1",
        kind: ReadingActivityKind.COMPLETE,
        progress: 0.4,
        position: 120,
      }),
    ).resolves.toBe(event);

    expect(transaction.readingDocumentRevision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "revision-1",
          documentId: "document-1",
        }),
      }),
    );
    expect(transaction.readingActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        progress: 1,
        kind: ReadingActivityKind.COMPLETE,
        eventVersion: 1,
      }),
    });
    expect(transaction.readingProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ progress: 1 }),
        update: expect.objectContaining({
          progress: 1,
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("keeps monotonic progress on one revision and resets it on a new revision", async () => {
    const firstProjection = {
      revisionId: "revision-1",
      progress: 0.4,
      position: 40,
      learnedWordCount: 2,
      totalReadSeconds: 60,
      eventVersion: 2,
      completedAt: null,
    };
    const secondProjection = {
      ...firstProjection,
      progress: 0.5,
      position: 50,
      learnedWordCount: 3,
      totalReadSeconds: 70,
      eventVersion: 3,
    };
    const upsert = vi.fn(async () => undefined);
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      readingDocumentRevision: {
        findFirst: vi.fn(async ({ where }) => ({
          id: where.id,
          documentId: where.documentId,
        })),
      },
      readingActivity: {
        create: vi.fn(async ({ data }) => ({
          id: `event-${data.eventVersion}`,
        })),
      },
      readingProgress: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(firstProjection)
          .mockResolvedValueOnce(secondProjection),
        upsert,
      },
    };
    const service = serviceFor(databaseWithTransaction(transaction));

    await service.recordActivity(actor, {
      documentId: "document-1",
      revisionId: "revision-1",
      kind: ReadingActivityKind.PROGRESS,
      progress: 0.3,
      position: 30,
      learnedWordCount: 1,
      totalReadSeconds: 50,
    });
    await service.recordActivity(actor, {
      documentId: "document-1",
      revisionId: "revision-2",
      kind: ReadingActivityKind.OPEN,
    });

    expect(upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        update: expect.objectContaining({
          revisionId: "revision-1",
          progress: 0.4,
          position: 40,
          learnedWordCount: 2,
          totalReadSeconds: 60,
          eventVersion: 3,
        }),
      }),
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        update: expect.objectContaining({
          revisionId: "revision-2",
          progress: 0,
          position: 0,
          learnedWordCount: 0,
          totalReadSeconds: null,
          eventVersion: 4,
          completedAt: null,
        }),
      }),
    );
  });

  it("rejects a lookup activity without a revision position", async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      readingDocumentRevision: {
        findFirst: vi.fn(async () => ({ id: "revision-1" })),
      },
      readingProgress: { findUnique: vi.fn(), upsert: vi.fn() },
      readingActivity: { create: vi.fn() },
    };
    const service = serviceFor(databaseWithTransaction(transaction));

    await expect(
      service.recordActivity(actor, {
        documentId: "document-1",
        revisionId: "revision-1",
        kind: ReadingActivityKind.LOOKUP,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transaction.readingActivity.create).not.toHaveBeenCalled();
  });

  it("selects deterministic objective targets with at most one per sentence", async () => {
    const content = "Bank has several meanings. River describes another bank.";
    const revision = {
      ...readingRevision(content),
      documentId: "document-1",
      wordCount: 8,
    };
    const annotations = [
      objectiveAnnotation("annotation-1", "objective-1", 0),
      objectiveAnnotation("annotation-2", "objective-2", 5),
      objectiveAnnotation("annotation-3", "objective-3", 27),
    ];
    const memories = [
      objectiveMemory("objective-1", -1, 1, 1),
      objectiveMemory("objective-2", -2, 0.5, 2),
      objectiveMemory("objective-3", 1, 1, 0),
    ];
    const createMany = vi.fn(async () => ({ count: 2 }));
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      readingTarget: { count: vi.fn(async () => 0), createMany },
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      lexicalAnnotation: { findMany: vi.fn(async () => annotations) },
      userObjectiveMemoryState: { findMany: vi.fn(async () => memories) },
    };
    const database = {
      $transaction: vi.fn(async (operation: (client: unknown) => unknown) =>
        operation(transaction),
      ),
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      readingTarget: { findMany: vi.fn(async () => []) },
    } as unknown as SylisDatabase;
    const encryption = {
      decrypt: vi.fn(() => content),
    } as unknown as FieldEncryptionService;
    const targetPresentations = {
      resolve: vi.fn(async () => new Map()),
    } as unknown as LexicalTargetPresentationService;
    const service = serviceFor(database, { encryption, targetPresentations });

    await expect(service.selectTargets(actor, revision.id)).resolves.toEqual(
      [],
    );
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ annotationId: "annotation-2", rank: 1 }),
        expect.objectContaining({ annotationId: "annotation-3", rank: 2 }),
      ],
    });
  });

  it("does not create a ReadingTarget without the learner's objective memory", async () => {
    const content = "Bank has several meanings.";
    const revision = {
      ...readingRevision(content),
      documentId: "document-1",
      wordCount: 4,
    };
    const createMany = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      readingTarget: { count: vi.fn(async () => 0), createMany },
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      lexicalAnnotation: {
        findMany: vi.fn(async () => [
          objectiveAnnotation("annotation-1", "objective-1", 0),
        ]),
      },
      userObjectiveMemoryState: { findMany: vi.fn(async () => []) },
    };
    const database = {
      $transaction: vi.fn(async (operation: (client: unknown) => unknown) =>
        operation(transaction),
      ),
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      readingTarget: { findMany: vi.fn(async () => []) },
    } as unknown as SylisDatabase;
    const encryption = {
      decrypt: vi.fn(() => content),
    } as unknown as FieldEncryptionService;
    const targetPresentations = {
      resolve: vi.fn(async () => new Map()),
    } as unknown as LexicalTargetPresentationService;
    const service = serviceFor(database, { encryption, targetPresentations });

    await expect(service.selectTargets(actor, revision.id)).resolves.toEqual(
      [],
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it("binds a saved document to the learner's own library collection", async () => {
    const transaction = {
      readingDocument: {
        findFirst: vi.fn(async () => ({ id: "document-1" })),
      },
      readingCollection: {
        upsert: vi.fn(async () => ({ id: "collection-1" })),
      },
      readingCollectionItem: {
        upsert: vi.fn(async ({ create }) => ({ id: "item-1", ...create })),
      },
    };
    const service = serviceFor(databaseWithTransaction(transaction));

    await service.save(actor, {
      documentId: "document-1",
      note: "Review tomorrow",
      tags: ["reading"],
    });

    expect(transaction.readingCollection.upsert).toHaveBeenCalledWith({
      where: {
        userId_identityKey: {
          userId: actor.userId,
          identityKey: "library",
        },
      },
      create: {
        userId: actor.userId,
        identityKey: "library",
        title: "Saved reading",
      },
      update: {},
    });
    expect(transaction.readingCollectionItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: actor.userId,
          collectionId: "collection-1",
          documentId: "document-1",
        }),
      }),
    );
  });

  it("resolves only an exact UTF-16 selection from the requested revision", async () => {
    const content = "Alpha beta.";
    const revision = readingRevision(content);
    const findMany = vi.fn(async () => []);
    const database = {
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      headwordRevision: { findMany },
    } as unknown as SylisDatabase;
    const encryption = {
      decrypt: vi.fn(() => content),
    } as unknown as FieldEncryptionService;
    const releases = {
      resolve: vi.fn(async () => ({
        releaseId: "00000000-0000-4000-8000-000000000010",
        releaseVersion: "0.0.1",
      })),
    } as unknown as ActiveReleaseService;
    const service = serviceFor(database, { encryption, releases });

    await expect(
      service.resolveSelection(actor, revision.id, {
        text: "beta",
        revisionContentHash: revision.contentHash,
        offsetUnit: TextOffsetUnit.UTF16_CODE_UNIT,
        startOffset: 6,
        endOffset: 10,
      }),
    ).resolves.toMatchObject({ selectedText: "beta", matches: [] });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ normalizedText: expect.any(Object) }),
      }),
    );
  });

  it("rejects selection text that does not equal the revision slice", async () => {
    const content = "Alpha beta.";
    const revision = readingRevision(content);
    const findMany = vi.fn();
    const database = {
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      headwordRevision: { findMany },
    } as unknown as SylisDatabase;
    const encryption = {
      decrypt: vi.fn(() => content),
    } as unknown as FieldEncryptionService;
    const service = serviceFor(database, { encryption });

    await expect(
      service.resolveSelection(actor, revision.id, {
        text: "zeta",
        revisionContentHash: revision.contentHash,
        offsetUnit: TextOffsetUnit.UTF16_CODE_UNIT,
        startOffset: 6,
        endOffset: 10,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects a selector bound to a different revision content hash", async () => {
    const content = "Alpha beta.";
    const revision = readingRevision(content);
    const database = {
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      headwordRevision: { findMany: vi.fn() },
    } as unknown as SylisDatabase;
    const encryption = {
      decrypt: vi.fn(() => content),
    } as unknown as FieldEncryptionService;
    const service = serviceFor(database, { encryption });

    await expect(
      service.resolveSelection(actor, revision.id, {
        text: "beta",
        revisionContentHash: sha256("different revision"),
        offsetUnit: TextOffsetUnit.UTF16_CODE_UNIT,
        startOffset: 6,
        endOffset: 10,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("rejects UTF-16 offsets that split a surrogate pair", async () => {
    const content = "A😀B";
    const revision = readingRevision(content);
    const database = {
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      headwordRevision: { findMany: vi.fn() },
    } as unknown as SylisDatabase;
    const encryption = {
      decrypt: vi.fn(() => content),
    } as unknown as FieldEncryptionService;
    const service = serviceFor(database, { encryption });

    await expect(
      service.resolveSelection(actor, revision.id, {
        text: content.slice(1, 2),
        revisionContentHash: revision.contentHash,
        offsetUnit: TextOffsetUnit.UTF16_CODE_UNIT,
        startOffset: 1,
        endOffset: 2,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("rejects stored quote context that does not match decrypted content", async () => {
    const content = "Alpha beta.";
    const revision = readingRevision(content);
    const database = {
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
      lexicalAnnotation: {
        findMany: vi.fn(async () => [
          {
            revisionContentHash: revision.contentHash,
            offsetUnit: TextOffsetUnit.UTF16_CODE_UNIT,
            startOffset: 6,
            endOffset: 10,
            exactTextHash: sha256("beta"),
            prefixLength: 6,
            prefixTextHash: sha256("wrong prefix"),
            suffixLength: 1,
            suffixTextHash: sha256("."),
          },
        ]),
      },
    } as unknown as SylisDatabase;
    const encryption = {
      decrypt: vi.fn(() => content),
    } as unknown as FieldEncryptionService;
    const service = serviceFor(database, { encryption });

    await expect(
      service.annotations(actor, revision.id),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("rejects decrypted revision content whose persisted hash is invalid", async () => {
    const content = "Alpha beta.";
    const revision = {
      ...readingRevision(content),
      contentHash: sha256("tampered"),
    };
    const database = {
      readingDocumentRevision: { findFirst: vi.fn(async () => revision) },
    } as unknown as SylisDatabase;
    const encryption = {
      decrypt: vi.fn(() => content),
    } as unknown as FieldEncryptionService;
    const service = serviceFor(database, { encryption });

    await expect(
      service.annotations(actor, revision.id),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

function readingRevision(content: string) {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    contentCiphertext: new Uint8Array([1, 2, 3]),
    keyVersion: "test-key",
    contentHash: sha256(content),
  };
}

function articleArtifact(): AgentArtifactRevisionSnapshot {
  return {
    artifactId: "00000000-0000-4000-8000-000000000040",
    revisionId: "00000000-0000-4000-8000-000000000041",
    artifactKind: AgentArtifactKind.ARTICLE,
    title: "A bank by the river",
    schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1,
    contentHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    document: {
      schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1,
      artifactKind: AgentArtifactKind.ARTICLE,
      languageTag: "en",
      cefrLevel: AgentCefrLevel.B1,
      genre: AgentReadingGenre.ARTICLE,
      summary: "A short reading about two meanings of bank.",
      sections: [
        {
          heading: "Bank",
          paragraphs: ["The bank approved a loan beside the quiet river bank."],
        },
      ],
      targetRefs: [],
      glossary: [],
    },
  };
}

function objectiveAnnotation(
  id: string,
  objectiveRevisionId: string,
  startOffset: number,
) {
  return {
    id,
    revisionId: "00000000-0000-4000-8000-000000000020",
    releaseId: "release-1",
    targetKind: LexicalAnnotationTargetKind.OBJECTIVE,
    startOffset,
    objectiveTarget: { objectiveRevisionId },
  };
}

function objectiveMemory(
  objectiveRevisionId: string,
  dueOffsetDays: number,
  stability: number,
  reviewCount: number,
) {
  return {
    releaseId: "release-1",
    objectiveRevisionId,
    dueAt: new Date(Date.now() + dueOffsetDays * 86_400_000),
    stability,
    elapsedDays: 2,
    reviewCount,
  };
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
