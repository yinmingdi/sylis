import {
  AgentOwnerCommandKind,
  AgentProposalDecision,
  AgentResourceKind,
} from "@sylis/agent-contracts";
import {
  AgentProposalDecision as DatabaseAgentProposalDecision,
  AgentProposalRiskClass,
  AgentProposalStatus,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { ProductApiClient } from "../src/adapters/product-api.client";
import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentSchemaValidator } from "../src/modules/agent/agent-schema-validator";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "10000000-0000-4000-8000-000000000002";
const RUN_ID = "10000000-0000-4000-8000-000000000003";
const PROPOSAL_ID = "10000000-0000-4000-8000-000000000004";
const PAYLOAD_BODY_ID = "10000000-0000-4000-8000-000000000005";
const NOTEBOOK_ID = "10000000-0000-4000-8000-000000000006";
const GRANT_ID = "10000000-0000-4000-8000-000000000007";
const RESULT_ID = "10000000-0000-4000-8000-000000000008";
const IDEMPOTENCY_ID = "10000000-0000-4000-8000-000000000009";
const ACTION_DIGEST = `sha256:${"a".repeat(64)}`;

describe("Agent proposal commit concurrency", () => {
  it("allows only one concurrent approval request to call the Product API", async () => {
    const fixture = proposalFixture();
    const first = fixture.service.decideProposal(USER_ID, PROPOSAL_ID, {
      decision: AgentProposalDecision.APPROVE,
      actionDigest: ACTION_DIGEST,
    });
    const second = fixture.service.decideProposal(USER_ID, PROPOSAL_ID, {
      decision: AgentProposalDecision.APPROVE,
      actionDigest: ACTION_DIGEST,
    });

    const results = await Promise.all([first, second]);

    expect(fixture.productApi.commitOwnerCommand).toHaveBeenCalledOnce();
    expect(fixture.agentToolGrantCreate).toHaveBeenCalledOnce();
    expect(fixture.current().status).toBe(AgentProposalStatus.COMMITTED);
    expect(results.map(({ status }) => status)).toContain(
      AgentProposalStatus.COMMITTED,
    );
  });

  it("reclaims an expired commit lease with a new fencing token", async () => {
    const originalAttemptId = "10000000-0000-4000-8000-000000000010";
    const fixture = proposalFixture({
      status: AgentProposalStatus.COMMITTING,
      decision: DatabaseAgentProposalDecision.APPROVE,
      decidedByUserId: USER_ID,
      decidedAt: new Date(Date.now() - 120_000),
      grantId: GRANT_ID,
      commitAttemptId: originalAttemptId,
      commitLeaseExpiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      fixture.service.decideProposal(USER_ID, PROPOSAL_ID, {
        decision: AgentProposalDecision.APPROVE,
        actionDigest: ACTION_DIGEST,
      }),
    ).resolves.toMatchObject({ status: AgentProposalStatus.COMMITTED });

    expect(fixture.productApi.commitOwnerCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: PROPOSAL_ID,
        commitAttemptId: expect.any(String),
      }),
    );
    expect(fixture.current().commitAttemptId).not.toBe(originalAttemptId);
  });

  it("reclaims an expired lease to recover a prior Product API commit", async () => {
    const fixture = proposalFixture({
      status: AgentProposalStatus.COMMITTING,
      decision: DatabaseAgentProposalDecision.APPROVE,
      decidedByUserId: USER_ID,
      decidedAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 60_000),
      grantId: GRANT_ID,
      commitAttemptId: "10000000-0000-4000-8000-000000000010",
      commitLeaseExpiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      fixture.service.decideProposal(USER_ID, PROPOSAL_ID, {
        decision: AgentProposalDecision.APPROVE,
        actionDigest: ACTION_DIGEST,
      }),
    ).resolves.toMatchObject({ status: AgentProposalStatus.COMMITTED });

    expect(fixture.productApi.commitOwnerCommand).toHaveBeenCalledOnce();
    expect(fixture.current().status).toBe(AgentProposalStatus.COMMITTED);
  });
});

interface ProposalState {
  id: string;
  runId: string;
  actionDigest: string;
  status: AgentProposalStatus;
  decision: DatabaseAgentProposalDecision | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  expiresAt: Date;
  grantId: string | null;
  commitAttemptId: string | null;
  commitLeaseExpiresAt: Date | null;
  committedResultRef: unknown;
  committedAt: Date | null;
  payloadContentBodyId: string;
  targetRef: { kind: AgentResourceKind; id: string };
  commandType: AgentOwnerCommandKind;
  riskClass: AgentProposalRiskClass;
  run: { sessionId: string };
}

function proposalFixture(override: Partial<ProposalState> = {}) {
  let proposal: ProposalState = {
    id: PROPOSAL_ID,
    runId: RUN_ID,
    actionDigest: ACTION_DIGEST,
    status: AgentProposalStatus.PENDING,
    decision: null,
    decidedByUserId: null,
    decidedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    grantId: null,
    commitAttemptId: null,
    commitLeaseExpiresAt: null,
    committedResultRef: null,
    committedAt: null,
    payloadContentBodyId: PAYLOAD_BODY_ID,
    targetRef: { kind: AgentResourceKind.NOTEBOOK, id: NOTEBOOK_ID },
    commandType: AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD,
    riskClass: AgentProposalRiskClass.MEDIUM,
    run: { sessionId: SESSION_ID },
    ...override,
  };
  const events = new Map<string, Readonly<Record<string, unknown>>>();
  let runSequence = 0;
  let sessionSequence = 0;
  const agentToolGrantCreate = vi.fn(async () => ({ id: GRANT_ID }));
  const transaction = {
    $queryRaw: vi.fn(async () => [{ id: RUN_ID }]),
    agentProposal: {
      findFirst: vi.fn(async () => ({ ...proposal })),
      findUniqueOrThrow: vi.fn(async () => ({ ...proposal })),
      update: vi.fn(async ({ data }: { data: Partial<ProposalState> }) => {
        proposal = { ...proposal, ...data };
        return { ...proposal };
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Partial<ProposalState>;
          data: Partial<ProposalState>;
        }) => {
          if (
            (where.status !== undefined && where.status !== proposal.status) ||
            (where.commitAttemptId !== undefined &&
              where.commitAttemptId !== proposal.commitAttemptId)
          ) {
            return { count: 0 };
          }
          proposal = { ...proposal, ...data };
          return { count: 1 };
        },
      ),
    },
    agentToolGrant: { create: agentToolGrantCreate },
    agentEvent: {
      findUnique: vi.fn(
        async ({ where }: { where: { idempotencyKey: string } }) =>
          events.get(where.idempotencyKey) ?? null,
      ),
      create: vi.fn(
        async ({ data }: { data: Readonly<Record<string, unknown>> }) => {
          events.set(String(data.idempotencyKey), data);
          return data;
        },
      ),
    },
    agentRun: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: RUN_ID,
        sessionId: SESSION_ID,
        nextEventSequence: runSequence,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.nextEventSequence) runSequence += 1;
        return { id: RUN_ID };
      }),
    },
    agentSession: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: SESSION_ID,
        nextEventSequence: sessionSequence,
      })),
      update: vi.fn(async () => {
        sessionSequence += 1;
        return { id: SESSION_ID };
      }),
    },
    agentWaitCondition: { updateMany: vi.fn(async () => ({ count: 1 })) },
    job: {
      findFirst: vi.fn(async () => ({
        id: "10000000-0000-4000-8000-000000000011",
      })),
      create: vi.fn(async () => ({
        id: "10000000-0000-4000-8000-000000000012",
      })),
    },
    outboxEvent: { create: vi.fn(async () => ({ id: "outbox" })) },
  };
  let tail = Promise.resolve();
  const database = {
    agentProposal: {
      findFirst: vi.fn(async () => ({ ...proposal })),
    },
    $transaction: vi.fn(
      <T>(callback: (value: typeof transaction) => Promise<T>): Promise<T> => {
        const result = tail.then(() => callback(transaction));
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    ),
  } as unknown as SylisDatabase;
  const gateway = {
    readContent: vi.fn(async () => ({
      plaintext: JSON.stringify({
        target: { kind: "ENTRY", id: RESULT_ID },
      }),
    })),
  } as unknown as ModelGatewayClient;
  const productApi = {
    commitOwnerCommand: vi.fn(async () => ({
      resultId: RESULT_ID,
      idempotencyRecordId: IDEMPOTENCY_ID,
      replayed: false,
    })),
  } as unknown as ProductApiClient;
  return {
    service: new AgentDomainService(
      database,
      gateway,
      productApi,
      {} as AgentSchemaValidator,
    ),
    productApi,
    agentToolGrantCreate,
    current: () => proposal,
  };
}
