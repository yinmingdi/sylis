import { ConflictException } from "@nestjs/common";
import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentCefrLevel,
  AgentOwnerCommandKind,
  AgentReadingGenre,
  AgentResourceKind,
  type AgentArticleDocument,
  type AgentArtifactRevisionSnapshot,
  type AgentResourceRef,
} from "@sylis/agent-contracts";
import { PrismaTypes, type SylisDatabase } from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { AgentOperationsService } from "./agent-operations.service";
import type { LexiconQueryService } from "../lexicon/services/lexicon-query.service";
import type { NotebooksService } from "../notebooks/services/notebooks.service";
import type { ReadingService } from "../reading/services/reading.service";
import type { StudyService } from "../study/services/study.service";

const userId = "00000000-0000-4000-8000-000000000001";
const proposalId = "00000000-0000-4000-8000-000000000002";
const commitAttemptId = "00000000-0000-4000-8000-000000000013";

describe("AgentOperationsService owner commands", () => {
  it("commits an exact approved ARTICLE revision as a private Reading document", async () => {
    const artifact = articleSnapshot();
    const target = artifactTarget(artifact);
    const payload = { title: artifact.title };
    const reading = {
      publishAgentArticle: vi.fn(async () => ({
        documentId: "00000000-0000-4000-8000-000000000010",
        revisionId: "00000000-0000-4000-8000-000000000011",
      })),
    } as unknown as ReadingService;
    const database = {
      agentProposal: { findFirst: vi.fn(async () => ({ id: proposalId })) },
      idempotencyRecord: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "00000000-0000-4000-8000-000000000012",
        })),
      },
    } as unknown as SylisDatabase;
    const service = serviceFor(database, reading);

    await expect(
      service.commitOwnerCommand("agent-api", {
        userId,
        proposalId,
        commandKind: AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH,
        target,
        payload,
        artifact,
        actionDigest: digest({
          commandKind: AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH,
          target,
          input: payload,
        }),
        idempotencyKey: `proposal/${proposalId}/commit`,
        commitAttemptId,
      }),
    ).resolves.toMatchObject({
      resultId: "00000000-0000-4000-8000-000000000011",
      resourceKind: AgentResourceKind.READING_DOCUMENT_REVISION,
      documentId: "00000000-0000-4000-8000-000000000010",
      revisionId: "00000000-0000-4000-8000-000000000011",
      replayed: false,
    });
    expect(reading.publishAgentArticle).toHaveBeenCalledOnce();
  });

  it("rejects a trusted snapshot whose document no longer matches the pinned hash", async () => {
    const artifact = articleSnapshot();
    const target = artifactTarget(artifact);
    const payload = { title: artifact.title };
    const reading = {
      publishAgentArticle: vi.fn(),
    } as unknown as ReadingService;
    const database = {
      agentProposal: { findFirst: vi.fn(async () => ({ id: proposalId })) },
      idempotencyRecord: { findUnique: vi.fn(async () => null) },
    } as unknown as SylisDatabase;
    const service = serviceFor(database, reading);

    await expect(
      service.commitOwnerCommand("agent-api", {
        userId,
        proposalId,
        commandKind: AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH,
        target,
        payload,
        artifact: {
          ...artifact,
          document: {
            ...artifact.document,
            summary: "Changed after approval.",
          },
        },
        actionDigest: digest({
          commandKind: AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH,
          target,
          input: payload,
        }),
        idempotencyKey: `proposal/${proposalId}/commit`,
        commitAttemptId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(reading.publishAgentArticle).not.toHaveBeenCalled();
  });

  it("replays the winning idempotency record when concurrent commits race", async () => {
    const artifact = articleSnapshot();
    const target = artifactTarget(artifact);
    const payload = { title: artifact.title };
    const result = {
      documentId: "00000000-0000-4000-8000-000000000010",
      revisionId: "00000000-0000-4000-8000-000000000011",
    };
    const record = {
      id: "00000000-0000-4000-8000-000000000012",
      requestHash: digest({
        commandKind: AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH,
        target,
        input: payload,
      }),
      agentProposalId: proposalId,
      responseRef: result.revisionId,
    };
    let committedRecord: typeof record | null = null;
    const reading = {
      publishAgentArticle: vi.fn(async () => result),
    } as unknown as ReadingService;
    const database = {
      agentProposal: { findFirst: vi.fn(async () => ({ id: proposalId })) },
      readingDocumentRevision: {
        findFirst: vi.fn(async () => ({
          id: result.revisionId,
          documentId: result.documentId,
        })),
      },
      idempotencyRecord: {
        findUnique: vi.fn(async () => committedRecord),
        create: vi.fn(async () => {
          if (committedRecord) {
            throw new PrismaTypes.PrismaClientKnownRequestError(
              "duplicate idempotency record",
              { code: "P2002", clientVersion: "6.9.0" },
            );
          }
          committedRecord = record;
          return record;
        }),
      },
    } as unknown as SylisDatabase;
    const service = serviceFor(database, reading);
    const input = {
      userId,
      proposalId,
      commandKind: AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH,
      target,
      payload,
      artifact,
      actionDigest: record.requestHash,
      idempotencyKey: `proposal/${proposalId}/commit`,
      commitAttemptId,
    };

    const responses = await Promise.all([
      service.commitOwnerCommand("agent-api", input),
      service.commitOwnerCommand("agent-api", input),
    ]);

    expect(responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ replayed: false }),
        expect.objectContaining({ replayed: true }),
      ]),
    );
    expect(reading.publishAgentArticle).toHaveBeenCalledTimes(2);
  });

  it("replays a committed result after the Proposal authorization expires", async () => {
    const artifact = articleSnapshot();
    const target = artifactTarget(artifact);
    const payload = { title: artifact.title };
    const result = {
      documentId: "00000000-0000-4000-8000-000000000010",
      revisionId: "00000000-0000-4000-8000-000000000011",
    };
    const actionDigest = digest({
      commandKind: AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH,
      target,
      input: payload,
    });
    const agentProposalFindFirst = vi.fn(async () => null);
    const reading = {
      publishAgentArticle: vi.fn(),
    } as unknown as ReadingService;
    const database = {
      agentProposal: { findFirst: agentProposalFindFirst },
      readingDocumentRevision: {
        findFirst: vi.fn(async () => ({
          id: result.revisionId,
          documentId: result.documentId,
        })),
      },
      idempotencyRecord: {
        findUnique: vi.fn(async () => ({
          id: "00000000-0000-4000-8000-000000000012",
          requestHash: actionDigest,
          agentProposalId: proposalId,
          responseRef: result.revisionId,
        })),
      },
    } as unknown as SylisDatabase;

    await expect(
      serviceFor(database, reading).commitOwnerCommand("agent-api", {
        userId,
        proposalId,
        commandKind: AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH,
        target,
        payload,
        artifact,
        actionDigest,
        idempotencyKey: `proposal/${proposalId}/commit`,
        commitAttemptId,
      }),
    ).resolves.toMatchObject({
      resultId: result.revisionId,
      replayed: true,
    });
    expect(agentProposalFindFirst).not.toHaveBeenCalled();
    expect(reading.publishAgentArticle).not.toHaveBeenCalled();
  });
});

function serviceFor(database: SylisDatabase, reading: ReadingService) {
  return new AgentOperationsService(
    database,
    {} as LexiconQueryService,
    {} as StudyService,
    reading,
    {} as NotebooksService,
  );
}

function articleSnapshot(): AgentArtifactRevisionSnapshot {
  const document: AgentArticleDocument = {
    schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1,
    artifactKind: AgentArtifactKind.ARTICLE,
    languageTag: "en",
    cefrLevel: AgentCefrLevel.B1,
    genre: AgentReadingGenre.ARTICLE,
    summary: "A short reading about a river bank.",
    sections: [
      {
        heading: "Two banks",
        paragraphs: ["The bank stands near the river bank."],
      },
    ],
    targetRefs: [],
    glossary: [],
  };
  return {
    artifactId: "00000000-0000-4000-8000-000000000003",
    revisionId: "00000000-0000-4000-8000-000000000004",
    artifactKind: AgentArtifactKind.ARTICLE,
    title: "Two banks",
    schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1,
    contentHash: digest(document),
    document,
  };
}

function artifactTarget(
  artifact: AgentArtifactRevisionSnapshot,
): AgentResourceRef {
  return {
    kind: AgentResourceKind.AGENT_ARTIFACT_REVISION,
    id: artifact.artifactId,
    revisionId: artifact.revisionId,
    contentHash: artifact.contentHash,
  };
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
