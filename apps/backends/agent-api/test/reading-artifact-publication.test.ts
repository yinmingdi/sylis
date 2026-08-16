import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentCefrLevel,
  AgentReadingGenre,
  AgentResourceKind,
  type AgentArtifactDocument,
  type AgentArtifactRevisionSnapshot,
  type AgentResourceRef,
} from "@sylis/agent-contracts";
import {
  AgentArtifactKind as DatabaseAgentArtifactKind,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { ProductApiClient } from "../src/adapters/product-api.client";
import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentSchemaValidator } from "../src/modules/agent/agent-schema-validator";

const OWNER_USER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000002";
const ARTIFACT_ID = "20000000-0000-4000-8000-000000000001";
const REVISION_ID = "30000000-0000-4000-8000-000000000001";
const CONTENT_BODY_ID = "40000000-0000-4000-8000-000000000001";

interface StoredArtifactRevision {
  id: string;
  artifactId: string;
  contentBodyId: string;
  schemaVersion: string;
  contentHash: string;
  ownerUserId: string;
  kind: DatabaseAgentArtifactKind;
  title: string;
}

interface ReadingArtifactInternals {
  readingArtifactSnapshot(
    userId: string,
    target: AgentResourceRef,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<AgentArtifactRevisionSnapshot>;
}

describe("AgentDomainService reading Artifact publication", () => {
  it("rejects an ARTICLE Artifact owned by another learner", async () => {
    const fixture = artifactFixture();
    const { service, findFirst } = serviceFor(fixture.stored, fixture.document);

    await expect(
      internals(service).readingArtifactSnapshot(
        OTHER_USER_ID,
        fixture.target,
        { title: fixture.stored.title },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          artifact: expect.objectContaining({ ownerUserId: OTHER_USER_ID }),
        }),
      }),
    );
  });

  it("rejects a non-ARTICLE Artifact even when the learner owns it", async () => {
    const fixture = artifactFixture({
      kind: DatabaseAgentArtifactKind.GRAMMAR_ANALYSIS,
    });
    const { service, gateway } = serviceFor(fixture.stored, fixture.document);

    await expect(
      internals(service).readingArtifactSnapshot(
        OWNER_USER_ID,
        fixture.target,
        { title: fixture.stored.title },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.readContent).not.toHaveBeenCalled();
  });

  it.each<{
    label: string;
    stored?: Partial<StoredArtifactRevision>;
    target?: Partial<Pick<AgentResourceRef, "revisionId" | "contentHash">>;
  }>([
    {
      label: "revision",
      target: { revisionId: "30000000-0000-4000-8000-000000000099" },
    },
    {
      label: "hash",
      target: {
        contentHash:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
    },
    {
      label: "schema",
      stored: { schemaVersion: "sylis.agent.article/999" },
    },
  ])("rejects an Artifact whose $label binding changed", async (drift) => {
    const fixture = artifactFixture(drift.stored);
    const { service, gateway } = serviceFor(fixture.stored, fixture.document);
    const target: AgentResourceRef = {
      ...fixture.target,
      ...drift.target,
    };

    await expect(
      internals(service).readingArtifactSnapshot(OWNER_USER_ID, target, {
        title: fixture.stored.title,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.readContent).not.toHaveBeenCalled();
  });

  it("rejects content whose encrypted body hash drifted before commit", async () => {
    const fixture = artifactFixture();
    const { service, gateway } = serviceFor(fixture.stored, fixture.document, {
      contentHash:
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    });

    await expect(
      internals(service).readingArtifactSnapshot(
        OWNER_USER_ID,
        fixture.target,
        { title: fixture.stored.title },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.readContent).toHaveBeenCalledWith(
      CONTENT_BODY_ID,
      OWNER_USER_ID,
    );
  });
});

function serviceFor(
  stored: StoredArtifactRevision,
  document: AgentArtifactDocument,
  bodyOverride: Partial<{ plaintext: string; contentHash: string }> = {},
) {
  const findFirst = vi.fn(
    async ({ where }: { where: Record<string, unknown> }) => {
      const artifact = where.artifact as Record<string, unknown>;
      const matches =
        where.id === stored.id &&
        where.artifactId === stored.artifactId &&
        where.schemaVersion === stored.schemaVersion &&
        where.contentHash === stored.contentHash &&
        artifact.ownerUserId === stored.ownerUserId &&
        artifact.kind === stored.kind;
      return matches
        ? {
            id: stored.id,
            artifactId: stored.artifactId,
            contentBodyId: stored.contentBodyId,
            schemaVersion: stored.schemaVersion,
            contentHash: stored.contentHash,
            artifact: { title: stored.title },
          }
        : null;
    },
  );
  const database = {
    agentArtifactRevision: { findFirst },
  } as unknown as SylisDatabase;
  const gateway = {
    readContent: vi.fn(async () => ({
      plaintext: bodyOverride.plaintext ?? canonicalJson(document),
      contentHash: bodyOverride.contentHash ?? digest(document),
    })),
  } as unknown as ModelGatewayClient;
  const schemas = {
    assert: vi.fn(),
  } as unknown as AgentSchemaValidator;
  return {
    service: new AgentDomainService(
      database,
      gateway,
      {} as ProductApiClient,
      schemas,
    ),
    findFirst,
    gateway,
  };
}

function artifactFixture(override: Partial<StoredArtifactRevision> = {}): {
  stored: StoredArtifactRevision;
  document: AgentArtifactDocument;
  target: AgentResourceRef;
} {
  const document = articleDocument();
  const stored = {
    id: REVISION_ID,
    artifactId: ARTIFACT_ID,
    contentBodyId: CONTENT_BODY_ID,
    schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1,
    contentHash: digest(document),
    ownerUserId: OWNER_USER_ID,
    kind: DatabaseAgentArtifactKind.ARTICLE,
    title: "A precise reading",
    ...override,
  };
  return {
    stored,
    document,
    target: {
      kind: AgentResourceKind.AGENT_ARTIFACT_REVISION,
      id: ARTIFACT_ID,
      revisionId: REVISION_ID,
      contentHash: stored.contentHash,
    },
  };
}

function articleDocument(): AgentArtifactDocument {
  return {
    schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1,
    artifactKind: AgentArtifactKind.ARTICLE,
    languageTag: "en",
    cefrLevel: AgentCefrLevel.B1,
    genre: AgentReadingGenre.ARTICLE,
    summary: "A short article used to verify exact publication.",
    sections: [
      {
        heading: "A precise reading",
        paragraphs: ["A learner reads one stable article revision."],
      },
    ],
    targetRefs: [],
    glossary: [],
  };
}

function internals(service: AgentDomainService): ReadingArtifactInternals {
  return service as unknown as ReadingArtifactInternals;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
