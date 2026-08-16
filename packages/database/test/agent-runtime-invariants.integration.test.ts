import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  AgentProposalDecision,
  AgentProposalRiskClass,
  AgentProposalStatus,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageRole,
  AgentMessageVisibility,
  AgentRunStatus,
  AgentSessionStatus,
  AgentRunStepStatus,
  AgentStepActionKind,
  AgentStepActionStatus,
  AgentToolCallStatus,
  AgentToolSideEffectClass,
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  CredentialOwnerKind,
  JobKind,
  JobOwnerType,
  JobStatus,
  ModelContentOwnerKind,
  ModelContentRetentionClass,
  ModelContentVisibility,
  ModelExecutionOwnerType,
  ModelInvocationAttemptStatus,
  ModelInvocationStatus,
  ModelOperationKind,
  ModelPermitStatus,
  ModelPurposeKind,
  ModelRetentionMode,
  ModelUsageEntryType,
  Prisma,
} from "@prisma/client";
import { createContentCrypto } from "@sylis/content-crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";
import {
  seedAgentRuntimeFixtures,
  type SeedAgentRuntimeFixturesResult,
} from "../src/testing/seed-agent-runtime";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;
const TEST_CONTENT_KEY = Buffer.alloc(32, 17);
const TEST_CREDENTIAL_KEY = Buffer.alloc(32, 29);
const TEST_FINGERPRINT_KEY = Buffer.alloc(32, 43);
const contentCrypto = createContentCrypto({
  currentVersion: () => "agent-runtime-invariant-test/1",
  key: (version) => {
    if (version !== "agent-runtime-invariant-test/1") {
      throw new Error("AGENT_RUNTIME_TEST_KEY_VERSION_INVALID");
    }
    return TEST_CONTENT_KEY;
  },
});

let releases: SeedAgentRuntimeFixturesResult;

describeDatabase("durable Agent runtime database invariants", () => {
  beforeAll(async () => {
    releases = await seedAgentRuntimeFixtures({
      database: database!,
      credentialKek: TEST_CREDENTIAL_KEY,
      credentialKekVersion: "agent-runtime-invariant-credential/1",
      credentialFingerprintKey: TEST_FINGERPRINT_KEY,
      contentEncryptionKey: TEST_CONTENT_KEY,
      contentEncryptionKeyVersion: "agent-runtime-invariant-content/1",
    });
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it("binds each Step to its Run and enforces one-way terminal state", async () => {
    const fixture = await createRuntimeFixture("step-state");
    const invocation = await createInvocation(fixture);
    const stepId = await createStep(fixture, invocation.id, 0);

    await expect(
      database!.agentRunStep.update({
        where: { id: stepId },
        data: { status: AgentRunStepStatus.TOOL_EXECUTION },
      }),
    ).resolves.toMatchObject({ status: AgentRunStepStatus.TOOL_EXECUTION });
    await expect(
      database!.agentRunStep.update({
        where: { id: stepId },
        data: { status: AgentRunStepStatus.STREAMING },
      }),
    ).rejects.toThrow(/AgentRunStep status transition is invalid/);

    const completedAt = new Date();
    await database!.agentRunStep.update({
      where: { id: stepId },
      data: { status: AgentRunStepStatus.FAILED, completedAt },
    });
    await expect(
      database!.agentRunStep.update({
        where: { id: stepId },
        data: { status: AgentRunStepStatus.CANCELLED },
      }),
    ).rejects.toThrow(/terminal AgentRunStep is immutable/);

    const otherFixture = await createRuntimeFixture("step-other-run");
    const mismatchedInvocation = await createInvocation(fixture);
    await expect(
      createStep(otherFixture, mismatchedInvocation.id, 0),
    ).rejects.toThrow(/invocation target must match its AgentRun/);

    const runningInvocation = await createInvocation(fixture);
    const runningStepId = await createStep(fixture, runningInvocation.id, 1);
    await expect(
      database!.agentRunStep.update({
        where: { id: runningStepId },
        data: {
          status: AgentRunStepStatus.COMPLETED,
          completedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/requires a succeeded ModelInvocation/);

    const succeededInvocation = await createInvocation(fixture);
    await completeInvocation(fixture, succeededInvocation);
    const succeededStepId = await createStep(
      fixture,
      succeededInvocation.id,
      2,
    );
    await expect(
      database!.agentRunStep.update({
        where: { id: succeededStepId },
        data: {
          status: AgentRunStepStatus.COMPLETED,
          completedAt: new Date(),
        },
      }),
    ).resolves.toMatchObject({ status: AgentRunStepStatus.COMPLETED });
  });

  it("allows only retry-safe, contiguous Provider attempts", async () => {
    const fixture = await createRuntimeFixture("attempt-state");
    const invocation = await createInvocation(fixture);
    const first = await database!.modelInvocationAttempt.create({
      data: { invocationId: invocation.id, ordinal: 0 },
    });

    await expect(
      database!.modelInvocationAttempt.update({
        where: { id: first.id },
        data: { acceptedBlockCount: -1 },
      }),
    ).rejects.toThrow(/counters must be non-negative/);

    await database!.modelInvocationAttempt.update({
      where: { id: first.id },
      data: {
        status: ModelInvocationAttemptStatus.FAILED,
        retryReason: "PROVIDER_UNAVAILABLE",
        errorClass: "PROVIDER_UNAVAILABLE",
        latencyMs: 3,
        completedAt: new Date(),
      },
    });
    await expect(
      database!.modelInvocationAttempt.create({
        data: { invocationId: invocation.id, ordinal: 1 },
      }),
    ).resolves.toMatchObject({ ordinal: 1 });
    await expect(
      database!.modelInvocationAttempt.update({
        where: { id: first.id },
        data: { errorClass: "DIFFERENT_ERROR" },
      }),
    ).rejects.toThrow(/terminal ModelInvocationAttempt is immutable/);

    const partialInvocation = await createInvocation(fixture);
    const partial = await database!.modelInvocationAttempt.create({
      data: { invocationId: partialInvocation.id, ordinal: 0 },
    });
    await expect(
      database!.modelInvocationAttempt.update({
        where: { id: partial.id },
        data: {
          status: ModelInvocationAttemptStatus.FAILED,
          retryReason: "STREAM_RESET",
          errorClass: "STREAM_RESET",
          acceptedBlockCount: 1,
          acceptedFragmentCount: 1,
          latencyMs: 4,
          completedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/retry reason requires a retry-safe failure/);

    const boundInvocation = await createInvocation(fixture);
    const boundAttempt = await database!.modelInvocationAttempt.create({
      data: { invocationId: boundInvocation.id, ordinal: 0 },
    });
    await database!.modelInvocationAttempt.update({
      where: { id: boundAttempt.id },
      data: {
        status: ModelInvocationAttemptStatus.FAILED,
        retryReason: "CONNECTION_RESET",
        errorClass: "CONNECTION_RESET",
        latencyMs: 2,
        completedAt: new Date(),
      },
    });
    await createStep(fixture, boundInvocation.id, 0);
    await expect(
      database!.modelInvocationAttempt.create({
        data: { invocationId: boundInvocation.id, ordinal: 1 },
      }),
    ).rejects.toThrow(
      /partial ModelInvocation output prevents transport retry/,
    );

    const terminalInvocation = await createInvocation(fixture);
    await completeInvocation(fixture, terminalInvocation);
    await expect(
      database!.modelInvocationAttempt.create({
        data: { invocationId: terminalInvocation.id, ordinal: 0 },
      }),
    ).rejects.toThrow(/terminal ModelInvocation cannot accept another attempt/);
  });

  it("keeps equal-input Tool calls independent and fences terminal outcomes", async () => {
    const fixture = await createRuntimeFixture("tool-state");
    const invocation = await createInvocation(fixture);
    const stepId = await createStep(fixture, invocation.id, 0);
    await database!.agentRunStep.update({
      where: { id: stepId },
      data: { status: AgentRunStepStatus.TOOL_EXECUTION },
    });

    const first = await createToolCall(fixture, stepId, 0, "provider-call-a");
    const second = await createToolCall(fixture, stepId, 1, "provider-call-b");
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.id).not.toBe(second.id);

    await expect(
      createToolCall(fixture, stepId, 2, "provider-call-a"),
    ).rejects.toMatchObject({ code: "P2002" });

    const executor = await createExecutorAttempt(fixture.runId);
    const startedAt = new Date();
    await database!.agentToolCall.update({
      where: { id: first.id },
      data: {
        status: AgentToolCallStatus.RUNNING,
        executorAttemptId: executor.id,
        executorFencingToken: executor.fencingToken,
        startedAt,
      },
    });
    await expect(
      database!.agentToolCall.update({
        where: { id: second.id },
        data: {
          status: AgentToolCallStatus.RUNNING,
          executorAttemptId: executor.id,
          executorFencingToken: executor.fencingToken + 1n,
          startedAt,
        },
      }),
    ).rejects.toThrow(/does not match a JobAttempt fence/);

    const resultBodyId = await createBody(
      fixture.userId,
      ModelContentOwnerKind.AGENT_TOOL_RESULT,
      "tool result",
    );
    await database!.agentToolCall.update({
      where: { id: first.id },
      data: {
        status: AgentToolCallStatus.SUCCEEDED,
        resultRef: { persisted: true },
        resultContentBodyId: resultBodyId,
        completedAt: new Date(),
      },
    });
    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "AgentToolCall" SET "resultRef" = NULL WHERE id = $1::uuid`,
        first.id,
      ),
    ).resolves.toBe(1);
    await expect(
      database!.agentToolCall.update({
        where: { id: first.id },
        data: { errorCode: "MUTATED" },
      }),
    ).rejects.toThrow(/terminal AgentToolCall is immutable/);
  });

  it("enforces typed, owned, immutable MessageBlock trees", async () => {
    const fixture = await createRuntimeFixture("block-state");
    const invocation = await createInvocation(fixture);
    const message = await database!.agentMessage.create({
      data: {
        sessionId: fixture.sessionId,
        runId: fixture.runId,
        role: AgentMessageRole.ASSISTANT,
        sequence: 1,
        visibility: AgentMessageVisibility.USER,
      },
    });
    const stepId = await createStep(fixture, invocation.id, 0, message.id);
    const contentBodyId = await createBody(
      fixture.userId,
      ModelContentOwnerKind.AGENT_MESSAGE,
      "visible block",
    );
    const blockId = randomUUID();
    await database!.$transaction(async (transaction) => {
      await transaction.agentMessageBlock.create({
        data: {
          id: blockId,
          messageId: message.id,
          position: 0,
          stepId,
          modelPosition: 0,
          modelSubPosition: 0,
          kind: AgentMessageBlockKind.PARAGRAPH,
          schemaVersion: "1",
          status: AgentMessageBlockStatus.STREAMING,
        },
      });
      await transaction.agentMessageBlockContent.create({
        data: { blockId, contentBodyId },
      });
    });
    const sealedAt = new Date();
    await database!.agentMessageBlock.update({
      where: { id: blockId },
      data: { status: AgentMessageBlockStatus.SEALED, sealedAt },
    });
    await expect(
      database!.agentMessageBlockContent.update({
        where: { blockId },
        data: { language: "en" },
      }),
    ).rejects.toThrow(
      /sealed or interrupted AgentMessageBlock payload is immutable/,
    );
    await expect(
      database!.agentMessageBlock.update({
        where: { id: blockId },
        data: { sealedAt: new Date(sealedAt.getTime() + 1) },
      }),
    ).rejects.toThrow(/sealed or interrupted AgentMessageBlock is immutable/);

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.agentMessageBlock.create({
          data: {
            messageId: message.id,
            position: 1,
            stepId,
            modelPosition: 1,
            modelSubPosition: 0,
            kind: AgentMessageBlockKind.PARAGRAPH,
            schemaVersion: "1",
            status: AgentMessageBlockStatus.SEALED,
            sealedAt: new Date(),
          },
        });
      }),
    ).rejects.toThrow(/requires exactly one typed child/);

    await database!.agentRunStep.update({
      where: { id: stepId },
      data: { status: AgentRunStepStatus.TOOL_EXECUTION },
    });
    const sameStepCall = await createToolCall(
      fixture,
      stepId,
      1,
      "block-provider-call",
    );
    await expect(
      database!.$transaction(async (transaction) => {
        const referenceBlock = await transaction.agentMessageBlock.create({
          data: {
            messageId: message.id,
            position: 1,
            stepId,
            modelPosition: 1,
            modelSubPosition: 0,
            kind: AgentMessageBlockKind.TOOL_CALL,
            schemaVersion: "1",
            status: AgentMessageBlockStatus.SEALED,
            sealedAt: new Date(),
          },
        });
        await transaction.agentMessageBlockReference.create({
          data: { blockId: referenceBlock.id, toolCallId: sameStepCall.id },
        });
      }),
    ).resolves.toBeUndefined();

    const otherFixture = await createRuntimeFixture("block-cross-owner");
    const otherInvocation = await createInvocation(otherFixture);
    const otherStepId = await createStep(otherFixture, otherInvocation.id, 0);
    await database!.agentRunStep.update({
      where: { id: otherStepId },
      data: { status: AgentRunStepStatus.TOOL_EXECUTION },
    });
    const otherCall = await createToolCall(
      otherFixture,
      otherStepId,
      0,
      "other-provider-call",
    );
    await expect(
      database!.$transaction(async (transaction) => {
        const referenceBlock = await transaction.agentMessageBlock.create({
          data: {
            messageId: message.id,
            position: 2,
            stepId,
            modelPosition: 2,
            modelSubPosition: 0,
            kind: AgentMessageBlockKind.TOOL_CALL,
            schemaVersion: "1",
            status: AgentMessageBlockStatus.SEALED,
            sealedAt: new Date(),
          },
        });
        await transaction.agentMessageBlockReference.create({
          data: { blockId: referenceBlock.id, toolCallId: otherCall.id },
        });
      }),
    ).rejects.toThrow(/target must belong to its Step, Run, or Session owner/);
  });

  it("fences Proposal leases and permits only due retention scrubbing", async () => {
    const fixture = await createRuntimeFixture("proposal-fencing");
    const prepurgedBodyId = await createBody(
      fixture.userId,
      ModelContentOwnerKind.AGENT_PROPOSAL,
      JSON.stringify({ label: "prepurged-proposal" }),
    );
    await expect(
      database!.agentProposal.create({
        data: {
          runId: fixture.runId,
          commandType: "notebook.item.add",
          commandVersion: "1",
          targetRef: {},
          payloadContentBodyId: prepurgedBodyId,
          actionDigest: digest("prepurged-proposal"),
          riskClass: AgentProposalRiskClass.MEDIUM,
          status: AgentProposalStatus.PENDING,
          expiresAt: new Date(Date.now() + 10 * 60_000),
          contentPurgedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/AGENT_PROPOSAL_PREPURGED_INSERT_FORBIDDEN/);

    const { proposal, targetRef, actionDigest } = await createPendingProposal(
      fixture,
      "proposal-fencing",
    );
    const grant = await database!.agentToolGrant.create({
      data: {
        userId: fixture.userId,
        sessionId: fixture.sessionId,
        runId: fixture.runId,
        toolKey: "notebook.item.add",
        resourceScope: {
          commandType: "notebook.item.add",
          target: targetRef,
        },
        sideEffectClass: AgentToolSideEffectClass.WRITE_PRIVATE_REVERSIBLE,
        maxCalls: 1,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        issuedBy: `user:${fixture.userId}`,
        actionDigest,
      },
    });
    const decidedAt = new Date();
    const firstAttemptId = randomUUID();

    await expect(
      database!.agentProposal.update({
        where: { id: proposal.id },
        data: {
          status: AgentProposalStatus.COMMITTING,
          decision: AgentProposalDecision.APPROVE,
          decidedByUserId: fixture.userId,
          decidedAt,
          grantId: grant.id,
          commitAttemptId: firstAttemptId,
          commitLeaseExpiresAt: new Date(Date.now() + 61_000),
        },
      }),
    ).rejects.toThrow(/AGENT_PROPOSAL_INITIAL_LEASE_INVALID/);

    const firstLeaseExpiresAt = new Date(Date.now() + 2_000);
    await database!.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: AgentProposalStatus.COMMITTING,
        decision: AgentProposalDecision.APPROVE,
        decidedByUserId: fixture.userId,
        decidedAt,
        grantId: grant.id,
        commitAttemptId: firstAttemptId,
        commitLeaseExpiresAt: firstLeaseExpiresAt,
      },
    });

    await expect(
      database!.agentProposal.update({
        where: { id: proposal.id },
        data: {
          commitAttemptId: randomUUID(),
          commitLeaseExpiresAt: new Date(Date.now() + 30_000),
        },
      }),
    ).rejects.toThrow(/AGENT_PROPOSAL_LEASE_TAKEOVER_INVALID/);

    await database!.$queryRaw`SELECT clock_timestamp() FROM pg_sleep(2.1)`;
    const secondAttemptId = randomUUID();
    await expect(
      database!.agentProposal.update({
        where: { id: proposal.id },
        data: {
          commitAttemptId: secondAttemptId,
          commitLeaseExpiresAt: new Date(Date.now() + 30_000),
        },
      }),
    ).resolves.toMatchObject({
      status: AgentProposalStatus.COMMITTING,
      commitAttemptId: secondAttemptId,
    });

    await expect(
      database!.agentProposal.update({
        where: { id: proposal.id },
        data: {
          status: AgentProposalStatus.FAILED,
          commitAttemptId: randomUUID(),
          committedResultRef: { errorCode: "CONTROLLED_FAILURE" },
        },
      }),
    ).rejects.toThrow(/AGENT_PROPOSAL_FENCING_TOKEN_CHANGED/);

    await database!.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: AgentProposalStatus.FAILED,
        committedResultRef: { errorCode: "CONTROLLED_FAILURE" },
      },
    });

    await expect(
      database!.agentProposal.update({
        where: { id: proposal.id },
        data: {
          targetRef: {},
          committedResultRef: Prisma.DbNull,
          contentPurgedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/AGENT_PROPOSAL_BINDING_IMMUTABLE/);

    const purgeAt = new Date();
    await database!.$transaction(async (transaction) => {
      await transaction.agentRun.update({
        where: { id: fixture.runId },
        data: { status: AgentRunStatus.CANCELLED, completedAt: purgeAt },
      });
      await transaction.agentSession.update({
        where: { id: fixture.sessionId },
        data: {
          status: AgentSessionStatus.DELETED,
          archivedAt: purgeAt,
          deletedAt: purgeAt,
        },
      });
      await transaction.contentDeletionRequest.create({
        data: {
          targetKind: ContentDeletionTargetKind.SESSION,
          requestedByUserId: fixture.userId,
          hiddenAt: purgeAt,
          purgeAfter: purgeAt,
          status: ContentDeletionStatus.RUNNING,
          sessionTarget: { create: { sessionId: fixture.sessionId } },
        },
      });
    });

    await expect(
      database!.agentProposal.update({
        where: { id: proposal.id },
        data: {
          targetRef: {},
          committedResultRef: Prisma.DbNull,
          contentPurgedAt: new Date(),
        },
      }),
    ).resolves.toMatchObject({
      status: AgentProposalStatus.FAILED,
      targetRef: {},
      committedResultRef: null,
      contentPurgedAt: expect.any(Date),
    });

    await expect(
      database!.agentProposal.update({
        where: { id: proposal.id },
        data: { committedResultRef: { errorCode: "LATE_RESULT" } },
      }),
    ).rejects.toThrow(/AGENT_PROPOSAL_BINDING_IMMUTABLE/);
  });

  it("only permits fragment envelope cryptoshred after its parent body is purged", async () => {
    const fixture = await createRuntimeFixture("fragment-cryptoshred");
    const invocation = await createInvocation(fixture);
    const bodyId = await createBody(
      fixture.userId,
      ModelContentOwnerKind.AGENT_MESSAGE,
      "Partial response",
    );
    const fragmentId = randomUUID();
    const plaintext = '[{"kind":"TEXT","text":"Partial response","marks":[]}]';
    const envelope = await contentCrypto.encrypt(Buffer.from(plaintext), {
      ownerKind: "agent-message-fragment",
      ownerId: bodyId,
      purpose: ModelPurposeKind.AGENT_RUN,
      recordId: fragmentId,
      schemaVersion: "model-content-fragment/1",
    });
    await database!.modelContentFragment.create({
      data: {
        id: fragmentId,
        bodyId,
        invocationId: invocation.id,
        modelPosition: 0,
        modelSubPosition: 0,
        fragmentSequence: 0,
        ciphertext: Buffer.from(envelope.ciphertext, "base64"),
        nonce: Buffer.from(envelope.nonce, "base64"),
        authTag: Buffer.from(envelope.authTag, "base64"),
        encryptedDek: Buffer.from(envelope.encryptedDek, "base64"),
        dekNonce: Buffer.from(envelope.dekNonce, "base64"),
        dekAuthTag: Buffer.from(envelope.dekAuthTag, "base64"),
        kekVersion: envelope.kekVersion,
        aadSchemaVersion: envelope.aadSchemaVersion,
        fragmentHash: digest(plaintext),
        byteLength: Buffer.byteLength(plaintext),
      },
    });

    await expect(
      database!.modelContentFragment.update({
        where: { id: fragmentId },
        data: { fragmentHash: digest("forbidden-before-purge") },
      }),
    ).rejects.toThrow(/ModelContentFragment is append-only/);

    const purgedAt = new Date();
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.modelContentBody.update({
          where: { id: bodyId },
          data: {
            ciphertext: randomBytes(32),
            nonce: randomBytes(12),
            authTag: randomBytes(16),
            encryptedDek: randomBytes(32),
            dekNonce: randomBytes(12),
            dekAuthTag: randomBytes(16),
            kekVersion: "purged",
            contentHash: digest(`purged:${bodyId}`),
            hiddenAt: purgedAt,
            purgeAfter: purgedAt,
            purgedAt,
          },
        });
        await transaction.modelContentFragment.updateMany({
          where: { bodyId },
          data: {
            ciphertext: randomBytes(32),
            nonce: randomBytes(12),
            authTag: randomBytes(16),
            encryptedDek: randomBytes(32),
            dekNonce: randomBytes(12),
            dekAuthTag: randomBytes(16),
            kekVersion: "purged",
            fragmentHash: digest(`purged-fragments:${bodyId}`),
          },
        });
      }),
    ).resolves.toBeUndefined();

    await expect(
      database!.modelContentFragment.update({
        where: { id: fragmentId },
        data: { modelPosition: 1 },
      }),
    ).rejects.toThrow(/ModelContentFragment is append-only/);
    await expect(
      database!.modelContentFragment.findUniqueOrThrow({
        where: { id: fragmentId },
        select: { kekVersion: true, fragmentHash: true },
      }),
    ).resolves.toEqual({
      kekVersion: "purged",
      fragmentHash: digest(`purged-fragments:${bodyId}`),
    });
  });
});

interface RuntimeFixture {
  capabilityReleaseId: string;
  credentialRevisionId: string;
  grantId: string;
  routeReleaseId: string;
  runId: string;
  sessionId: string;
  toolReleaseId: string;
  userId: string;
}

interface InvocationFixture {
  id: string;
  permitId: string;
  requestKey: string;
}

async function createRuntimeFixture(label: string): Promise<RuntimeFixture> {
  const user = await database!.user.create({
    data: { displayName: `Agent invariant ${label}` },
  });
  const session = await database!.agentSession.create({
    data: { userId: user.id, title: label },
  });
  const capability = await database!.capabilityRelease.findUniqueOrThrow({
    where: { id: releases.capabilityReleaseIds[0]! },
  });
  const tool = await database!.toolRelease.findUniqueOrThrow({
    where: { id: releases.toolReleaseIds[0]! },
  });
  const instructionBodyId = await createBody(
    user.id,
    ModelContentOwnerKind.AGENT_INSTRUCTION,
    `instruction:${label}`,
  );
  const instruction = await database!.agentInstruction.create({
    data: {
      sessionId: session.id,
      userId: user.id,
      contentBodyId: instructionBodyId,
      requestedCapability: capability.capabilityKey,
      resolvedCapability: capability.capabilityKey,
      capabilityReleaseId: capability.id,
      providerRouteReleaseId: releases.routeReleaseId,
      credentialRevisionId: releases.credentialRevisionId,
      inputHash: digest(`instruction:${label}`),
      idempotencyKey: randomUUID(),
    },
  });
  const runId = randomUUID();
  await database!.agentRun.create({
    data: {
      id: runId,
      sessionId: session.id,
      instructionId: instruction.id,
      rootRunId: runId,
      goalContentBodyId: instructionBodyId,
      capabilityReleaseId: capability.id,
      providerRouteReleaseId: releases.routeReleaseId,
      credentialRevisionId: releases.credentialRevisionId,
      requestedCapability: capability.capabilityKey,
      maxSteps: capability.maxSteps,
      maxToolCalls: capability.maxToolCalls,
      maxOutputTokens: capability.maxOutputTokens,
      status: AgentRunStatus.RUNNING,
      startedAt: new Date(),
    },
  });
  const grant = await database!.agentToolGrant.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      runId,
      toolKey: tool.toolKey,
      resourceScope: {},
      sideEffectClass: tool.sideEffectClass,
      maxCalls: Math.max(4, tool.maxCalls),
      expiresAt: new Date(Date.now() + 60 * 60_000),
      issuedBy: "agent-runtime-invariant-test",
      actionDigest: digest(`${runId}:grant`),
    },
  });
  return {
    capabilityReleaseId: capability.id,
    credentialRevisionId: releases.credentialRevisionId,
    grantId: grant.id,
    routeReleaseId: releases.routeReleaseId,
    runId,
    sessionId: session.id,
    toolReleaseId: tool.id,
    userId: user.id,
  };
}

async function createInvocation(
  fixture: RuntimeFixture,
): Promise<InvocationFixture> {
  const permitId = randomUUID();
  const invocationId = randomUUID();
  const requestKey = `agent-runtime-invariant:${permitId}`;
  const inputDigest = digest(requestKey);
  await database!.$transaction(async (transaction) => {
    await transaction.modelExecutionPermit.create({
      data: {
        id: permitId,
        callerServiceKey: "sylis-agent-executor",
        purpose: ModelPurposeKind.AGENT_RUN,
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerUserId: fixture.userId,
        routeReleaseId: fixture.routeReleaseId,
        credentialRevisionId: fixture.credentialRevisionId,
        capabilityReleaseId: fixture.capabilityReleaseId,
        operation: ModelOperationKind.STREAMING_GENERATION,
        inputDigest,
        maxInputTokens: 64,
        maxOutputTokens: 64,
        maxCostMicros: 0n,
        retentionMode: ModelRetentionMode.ENCRYPTED_EXCHANGE,
        requestKey,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        agentRunTarget: { create: { agentRunId: fixture.runId } },
      },
    });
    await transaction.modelUsageLedger.create({
      data: {
        userId: fixture.userId,
        purpose: ModelPurposeKind.AGENT_RUN,
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerId: fixture.runId,
        routeReleaseId: fixture.routeReleaseId,
        permitId,
        credentialOwnerKind: CredentialOwnerKind.PLATFORM,
        entryType: ModelUsageEntryType.RESERVATION,
        units: 128n,
        costMicros: 0n,
        idempotencyKey: requestKey,
      },
    });
  });
  await database!.$transaction(async (transaction) => {
    await transaction.modelExecutionPermit.update({
      where: { id: permitId },
      data: { status: ModelPermitStatus.CLAIMED, claimedAt: new Date() },
    });
    await transaction.modelInvocation.create({
      data: {
        id: invocationId,
        permitId,
        purpose: ModelPurposeKind.AGENT_RUN,
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerId: fixture.runId,
        routeReleaseId: fixture.routeReleaseId,
        credentialRevisionId: fixture.credentialRevisionId,
        status: ModelInvocationStatus.RUNNING,
        idempotencyKey: `permit:${permitId}`,
        inputDigest,
      },
    });
  });
  return { id: invocationId, permitId, requestKey };
}

async function createPendingProposal(fixture: RuntimeFixture, label: string) {
  const payloadContentBodyId = await createBody(
    fixture.userId,
    ModelContentOwnerKind.AGENT_PROPOSAL,
    JSON.stringify({ label }),
  );
  const targetRef = { kind: "NOTEBOOK", id: randomUUID() };
  const actionDigest = digest(`pending-proposal:${label}`);
  const proposal = await database!.agentProposal.create({
    data: {
      runId: fixture.runId,
      commandType: "notebook.item.add",
      commandVersion: "1",
      targetRef,
      payloadContentBodyId,
      actionDigest,
      riskClass: AgentProposalRiskClass.MEDIUM,
      status: AgentProposalStatus.PENDING,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  return { proposal, targetRef, actionDigest };
}

async function completeInvocation(
  fixture: RuntimeFixture,
  invocation: InvocationFixture,
): Promise<void> {
  await database!.$transaction(async (transaction) => {
    await transaction.modelInvocation.update({
      where: { id: invocation.id },
      data: {
        status: ModelInvocationStatus.SUCCEEDED,
        inputTokens: 0,
        outputTokens: 0,
        cacheHitTokens: 0,
        costMicros: 0n,
        latencyMs: 1,
        outputDigest: digest(`output:${invocation.id}`),
        completedAt: new Date(),
      },
    });
    await transaction.modelExecutionPermit.update({
      where: { id: invocation.permitId },
      data: { status: ModelPermitStatus.CONSUMED, consumedAt: new Date() },
    });
    await transaction.modelUsageLedger.create({
      data: {
        userId: fixture.userId,
        purpose: ModelPurposeKind.AGENT_RUN,
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerId: fixture.runId,
        routeReleaseId: fixture.routeReleaseId,
        permitId: invocation.permitId,
        credentialOwnerKind: CredentialOwnerKind.PLATFORM,
        entryType: ModelUsageEntryType.SETTLEMENT,
        units: 0n,
        costMicros: 0n,
        idempotencyKey: invocation.requestKey,
      },
    });
    await transaction.modelUsageLedger.create({
      data: {
        userId: fixture.userId,
        purpose: ModelPurposeKind.AGENT_RUN,
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerId: fixture.runId,
        routeReleaseId: fixture.routeReleaseId,
        permitId: invocation.permitId,
        credentialOwnerKind: CredentialOwnerKind.PLATFORM,
        entryType: ModelUsageEntryType.RELEASE,
        units: -128n,
        costMicros: 0n,
        idempotencyKey: invocation.requestKey,
      },
    });
  });
}

async function createStep(
  fixture: RuntimeFixture,
  modelInvocationId: string,
  ordinal: number,
  assistantMessageId?: string,
): Promise<string> {
  const created = await database!.agentRunStep.create({
    data: {
      runId: fixture.runId,
      ordinal,
      modelInvocationId,
      assistantMessageId,
      status: AgentRunStepStatus.STREAMING,
    },
  });
  return created.id;
}

async function createToolCall(
  fixture: RuntimeFixture,
  stepId: string,
  modelPosition: number,
  providerCallId: string,
) {
  const tool = await database!.toolRelease.findUniqueOrThrow({
    where: { id: fixture.toolReleaseId },
  });
  const inputHash = digest({ query: "same input" });
  const inputContentBodyId = await createBody(
    fixture.userId,
    ModelContentOwnerKind.AGENT_TOOL_INPUT,
    "same input",
  );
  const actionId = randomUUID();
  const actionDigest = digest({ stepId, modelPosition, providerCallId });
  return database!.$transaction(async (transaction) => {
    await transaction.agentRunStepAction.create({
      data: {
        id: actionId,
        stepId,
        modelPosition,
        kind: AgentStepActionKind.DOMAIN_TOOL,
        status: AgentStepActionStatus.PENDING,
        actionDigest,
      },
    });
    return transaction.agentToolCall.create({
      data: {
        stepId,
        actionId,
        modelPosition,
        providerCallId,
        toolKey: tool.toolKey,
        schemaVersion: tool.version,
        toolReleaseId: tool.id,
        inputHash,
        inputContentBodyId,
        grantId: fixture.grantId,
        sideEffectClass: tool.sideEffectClass,
        concurrencyMode: tool.concurrencyMode,
        status: AgentToolCallStatus.QUEUED,
        queuedAt: new Date(),
        actionDigest,
      },
    });
  });
}

async function createExecutorAttempt(runId: string) {
  const job = await database!.job.create({
    data: {
      kind: JobKind.AGENT_RUN_ACTIVATION,
      ownerType: JobOwnerType.AGENT_RUN,
      ownerId: runId,
      status: JobStatus.RUNNING,
      inputRef: {},
      inputHash: digest(`job:${runId}`),
      idempotencyKey: randomUUID(),
      startedAt: new Date(),
    },
  });
  const [sequence] = await database!.$queryRawUnsafe<
    Array<{ fencingToken: bigint }>
  >(`SELECT nextval('job_fencing_token_seq') AS "fencingToken"`);
  if (!sequence) throw new Error("JOB_FENCING_SEQUENCE_MISSING");
  return database!.jobAttempt.create({
    data: {
      jobId: job.id,
      attemptNumber: 1,
      handlerVersion: "agent-runtime-invariant/1",
      checkpointSchemaVersion: "1",
      leaseOwner: "agent-runtime-invariant-test",
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60 * 60_000),
      heartbeatAt: new Date(),
      fencingToken: sequence.fencingToken,
    },
  });
}

async function createBody(
  ownerUserId: string,
  ownerKind: ModelContentOwnerKind,
  plaintext: string,
): Promise<string> {
  const id = randomUUID();
  const schemaVersion = "model-content-body/1";
  const envelope = await contentCrypto.encrypt(Buffer.from(plaintext), {
    ownerKind,
    ownerId: ownerUserId,
    purpose: ModelPurposeKind.AGENT_RUN,
    recordId: id,
    schemaVersion,
  });
  await database!.modelContentBody.create({
    data: {
      id,
      ownerKind,
      ownerUserId,
      purpose: ModelPurposeKind.AGENT_RUN,
      ciphertext: Buffer.from(envelope.ciphertext, "base64"),
      nonce: Buffer.from(envelope.nonce, "base64"),
      authTag: Buffer.from(envelope.authTag, "base64"),
      encryptedDek: Buffer.from(envelope.encryptedDek, "base64"),
      dekNonce: Buffer.from(envelope.dekNonce, "base64"),
      dekAuthTag: Buffer.from(envelope.dekAuthTag, "base64"),
      kekVersion: envelope.kekVersion,
      aadSchemaVersion: envelope.aadSchemaVersion,
      contentHash: digest(plaintext),
      requestKey: `agent-runtime-invariant-body:${id}`,
      visibility: ModelContentVisibility.USER,
      retentionClass: ModelContentRetentionClass.USER_CONTROLLED,
    },
  });
  return id;
}

function digest(value: unknown): string {
  const encoded =
    typeof value === "string"
      ? value
      : (JSON.stringify(value, objectKeyOrder) ?? "null");
  return `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
}

function objectKeyOrder(_key: string, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}
