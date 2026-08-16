import {
  AgentCredentialSource,
  AgentEventType,
  type AgentExecutionSelectionInput,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageStatus,
  AgentOwnerCommandKind,
  AgentProposalDecision,
  AgentProposalStatus,
  AgentResourceKind,
  AgentRunStatus,
  AgentWaitKind,
  AgentWaitStatus,
  CapabilityKey,
} from "@sylis/agent-contracts";
import { LexicalTargetKind } from "@sylis/api-client/user";
import {
  DeterministicProviderScenario,
  deterministicProviderInstruction,
} from "@sylis/agent-contracts/testing";
import type { Page } from "@playwright/test";

import {
  authenticatedMutationHeaders,
  registerUserViaApi,
} from "../../fixtures/accounts";
import {
  readAgentSse as readSse,
  readAgentSessionSnapshot,
  type AgentSseFrame as SseFrame,
} from "../../fixtures/agent-events";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2ePorts, e2eTags } from "../../runtime";

interface SubmittedInstruction {
  instructionId: string;
  runId: string;
  eventCursor: number;
}

interface AgentRun {
  id: string;
  status: AgentRunStatus;
  waits: readonly {
    id: string;
    kind: AgentWaitKind;
    status: AgentWaitStatus;
  }[];
}

interface AgentProposal {
  id: string;
  actionDigest: string;
  status: AgentProposalStatus;
}

test(
  "AGENT-002-E2E duplicate instructions are idempotent and SSE resumes after Last-Event-ID",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(page, headers, namespace.value);
    const idempotencyKey = namespace.idempotencyKey("agent-instruction");
    const execution = await platformExecution(
      page,
      CapabilityKey.LEARNING_CHAT,
    );
    const input = {
      content:
        "Explain the difference between bank as a place and a river bank.",
      requestedCapability: CapabilityKey.LEARNING_CHAT,
      idempotencyKey,
      execution,
    };

    const firstResponse = await page.request.post(
      `/api/agent/v1/sessions/${sessionId}/instructions`,
      {
        headers: { ...headers, "Idempotency-Key": idempotencyKey },
        data: input,
      },
    );
    const firstBody = await firstResponse.text();
    expect(
      firstResponse.ok(),
      `first instruction submission failed: HTTP ${firstResponse.status()} ${firstBody}`,
    ).toBeTruthy();
    const first = JSON.parse(firstBody) as SubmittedInstruction;
    expect(first.runId).toBeTruthy();

    const duplicateResponse = await page.request.post(
      `/api/agent/v1/sessions/${sessionId}/instructions`,
      {
        headers: { ...headers, "Idempotency-Key": idempotencyKey },
        data: input,
      },
    );
    const duplicateBody = await duplicateResponse.text();
    expect(
      duplicateResponse.ok(),
      `duplicate instruction submission failed: HTTP ${duplicateResponse.status()} ${duplicateBody}`,
    ).toBeTruthy();
    expect(JSON.parse(duplicateBody)).toMatchObject({
      instructionId: first.instructionId,
      runId: first.runId,
      eventCursor: first.eventCursor,
    });

    const snapshot = await readAgentSessionSnapshot(page, sessionId);
    expect(snapshot.cursor).toBeGreaterThanOrEqual(first.eventCursor);
    expect(snapshot.runs.filter(({ id }) => id === first.runId)).toHaveLength(
      1,
    );

    const firstConnection = await readSse(page, sessionId, {
      lastEventId: first.eventCursor,
      maximumEvents: 1,
    });
    expect(firstConnection).toHaveLength(1);

    const resumed = await readSse(page, sessionId, {
      lastEventId: firstConnection[0]!.id,
      stopAt: AgentEventType.RUN_COMPLETED,
    });
    expect(resumed.length).toBeGreaterThan(0);
    expect(resumed.every((event) => event.id > firstConnection[0]!.id)).toBe(
      true,
    );
    expect(resumed.at(-1)?.type).toBe(AgentEventType.RUN_COMPLETED);
    const blockDeltas = [...firstConnection, ...resumed].filter(
      ({ type }) => type === AgentEventType.BLOCK_DELTA_APPENDED,
    );
    expect(blockDeltas.map(({ payload }) => payload.fragmentSequence)).toEqual([
      0, 1,
    ]);
    expect(blockDeltas[0]?.payload.body).toEqual(blockDeltas[1]?.payload.body);

    await expectRunStatus(
      page,
      sessionId,
      first.runId!,
      AgentRunStatus.SUCCEEDED,
    );
  },
);

test(
  "AGENT-011-MULTI-TOOL-E2E one Step preserves mixed text and two equal-input Tool calls across SSE replay",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(page, headers, namespace.value);
    const instruction = await submitInstruction(
      page,
      headers,
      sessionId,
      deterministicProviderInstruction(
        DeterministicProviderScenario.MIXED_MULTI_TOOL,
        JSON.stringify({ query: "bank", limit: 1 }),
      ),
      namespace.idempotencyKey("agent-mixed-multi-tool"),
    );

    await expectRunStatus(
      page,
      sessionId,
      instruction.runId,
      AgentRunStatus.SUCCEEDED,
    );
    const events = await readSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.RUN_COMPLETED,
    });
    const eventIds = events.map(({ id }) => id);
    expect(new Set(eventIds).size).toBe(eventIds.length);

    const proposed = events.filter(
      ({ type }) => type === AgentEventType.TOOL_CALL_PROPOSED,
    );
    const started = events.filter(
      ({ type }) => type === AgentEventType.TOOL_CALL_STARTED,
    );
    const completed = events.filter(
      ({ type }) => type === AgentEventType.TOOL_CALL_COMPLETED,
    );
    expect(proposed).toHaveLength(2);
    expect(started).toHaveLength(2);
    expect(completed).toHaveLength(2);
    expect(completed.map(({ payload }) => payload.modelPosition)).toEqual(
      expect.arrayContaining([1, 2]),
    );
    const completedToolCallIds = completed.map(({ payload }) =>
      requiredPayloadString(payload, "toolCallId"),
    );
    expect(new Set(completedToolCallIds).size).toBe(2);

    const openedToolBlocks = events.filter(
      ({ type, payload }) =>
        type === AgentEventType.BLOCK_OPENED &&
        payload.kind === AgentMessageBlockKind.TOOL_CALL,
    );
    expect(openedToolBlocks).toHaveLength(2);
    expect(
      openedToolBlocks.map(({ payload }) =>
        requiredPayloadString(payload, "toolCallId"),
      ),
    ).toEqual(expect.arrayContaining(completedToolCallIds));

    const snapshot = await readAgentSessionSnapshot(page, sessionId);
    const runBlocks = snapshot.messages
      .filter(({ runId }) => runId === instruction.runId)
      .flatMap(({ blocks }) => blocks);
    expect(
      runBlocks.filter(({ kind }) => kind === AgentMessageBlockKind.PARAGRAPH),
    ).not.toHaveLength(0);
    const toolBlocks = runBlocks.filter(
      ({ kind }) => kind === AgentMessageBlockKind.TOOL_CALL,
    );
    expect(toolBlocks).toHaveLength(2);
    expect(toolBlocks.map((block) => block.reference?.kind)).toEqual([
      AgentMessageBlockKind.TOOL_CALL,
      AgentMessageBlockKind.TOOL_CALL,
    ]);

    const replay = await readSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.RUN_COMPLETED,
    });
    expect(replay.map(({ id }) => id)).toEqual(eventIds);
  },
);

test(
  "AGENT-012-PARTIAL-BLOCK-E2E interrupted output remains visible and replays without duplicate Blocks",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace }) => {
    const partialText = "Partial answer retained for recovery.";
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(page, headers, namespace.value);
    const instruction = await submitInstruction(
      page,
      headers,
      sessionId,
      deterministicProviderInstruction(
        DeterministicProviderScenario.PARTIAL_STREAM_FAILURE,
        partialText,
      ),
      namespace.idempotencyKey("agent-partial-block"),
    );

    await expectRunStatus(
      page,
      sessionId,
      instruction.runId,
      AgentRunStatus.FAILED,
      60_000,
    );
    const events = await readSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.RUN_FAILED,
    });
    const blockOpened = events.filter(
      ({ type, payload }) =>
        type === AgentEventType.BLOCK_OPENED &&
        payload.kind === AgentMessageBlockKind.PARAGRAPH,
    );
    const blockInterrupted = events.filter(
      ({ type }) => type === AgentEventType.BLOCK_INTERRUPTED,
    );
    const blockDeltas = events.filter(
      ({ type }) => type === AgentEventType.BLOCK_DELTA_APPENDED,
    );
    expect(blockOpened).toHaveLength(1);
    expect(blockInterrupted).toHaveLength(1);
    expect(blockDeltas).toHaveLength(1);
    expect(blockDeltas[0]?.payload).toMatchObject({
      fragmentSequence: 0,
      body: [{ text: partialText }],
    });
    expect(
      events.filter(({ type }) => type === AgentEventType.MESSAGE_INTERRUPTED),
    ).toHaveLength(1);
    const interruptedBlockId = requiredPayloadString(
      blockInterrupted[0]!.payload,
      "blockId",
    );
    expect(interruptedBlockId).toBe(
      requiredPayloadString(blockOpened[0]!.payload, "blockId"),
    );
    expect(
      events.filter(
        ({ type, payload }) =>
          type === AgentEventType.BLOCK_SEALED &&
          payload.blockId === interruptedBlockId,
      ),
    ).toHaveLength(0);

    const snapshot = await readAgentSessionSnapshot(page, sessionId);
    const interruptedMessage = snapshot.messages.find(
      ({ runId, status }) =>
        runId === instruction.runId &&
        status === AgentMessageStatus.INTERRUPTED,
    );
    expect(interruptedMessage).toBeTruthy();
    const interruptedBlock = interruptedMessage!.blocks.find(
      ({ id }) => id === interruptedBlockId,
    );
    expect(interruptedBlock).toMatchObject({
      id: interruptedBlockId,
      kind: AgentMessageBlockKind.PARAGRAPH,
      status: AgentMessageBlockStatus.INTERRUPTED,
    });
    expect(
      interruptedBlock!.content?.body?.map(({ text }) => text).join(""),
    ).toBe(partialText);

    const replay = await readSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.RUN_FAILED,
    });
    expect(replay.map(({ id }) => id)).toEqual(events.map(({ id }) => id));
  },
);

test(
  "AGENT-003-E2E a user can cancel a queued or running Agent run",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(page, headers, namespace.value);
    const instruction = await submitInstruction(
      page,
      headers,
      sessionId,
      deterministicProviderInstruction(
        DeterministicProviderScenario.DELAY,
        "This response should be cancelled.",
      ),
      namespace.idempotencyKey("agent-cancel"),
    );
    expect(instruction.runId).toBeTruthy();

    const cancelResponse = await page.request.post(
      `/api/agent/v1/runs/${instruction.runId}/cancel`,
      { headers },
    );
    expect(cancelResponse.ok()).toBeTruthy();
    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.CANCELLED,
    );

    const events = await readSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.RUN_CANCELLED,
    });
    expect(events.at(-1)?.type).toBe(AgentEventType.RUN_CANCELLED);
  },
);

test(
  "AGENT-004-E2E every queued instruction immediately owns a Run",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(page, headers, namespace.value);
    const first = await submitInstruction(
      page,
      headers,
      sessionId,
      deterministicProviderInstruction(
        DeterministicProviderScenario.WAIT,
        JSON.stringify({
          reasonCode: "QUEUE_TEST_WAIT",
          correlationKey: `queue/${namespace.value}`,
        }),
      ),
      namespace.idempotencyKey("agent-queue-first"),
    );
    await expectRunStatus(page, sessionId, first.runId, AgentRunStatus.WAITING);

    const second = await submitInstruction(
      page,
      headers,
      sessionId,
      "Explain the word bank in one sentence.",
      namespace.idempotencyKey("agent-queue-second"),
    );
    expect(second.runId).toBeTruthy();
    expect(second.runId).not.toBe(first.runId);
    await expectRunStatus(page, sessionId, second.runId, AgentRunStatus.QUEUED);

    const cancelled = await page.request.post(
      `/api/agent/v1/runs/${first.runId}/cancel`,
      { headers },
    );
    expect(cancelled.ok()).toBeTruthy();
    await expectRunStatus(
      page,
      sessionId,
      second.runId,
      AgentRunStatus.SUCCEEDED,
    );
  },
);

test(
  "AGENT-005-E2E a user response resumes a waiting Agent run",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(page, headers, namespace.value);
    const instruction = await submitInstruction(
      page,
      headers,
      sessionId,
      deterministicProviderInstruction(
        DeterministicProviderScenario.WAIT,
        JSON.stringify({
          reasonCode: "USER_CLARIFICATION_REQUIRED",
          correlationKey: `e2e/${namespace.value}`,
        }),
      ),
      namespace.idempotencyKey("agent-wait"),
    );
    expect(instruction.runId).toBeTruthy();

    const waitingRun = await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.WAITING,
    );
    expect(waitingRun.waits).toHaveLength(1);
    expect(waitingRun.waits[0]).toMatchObject({
      kind: AgentWaitKind.USER_INPUT,
      status: AgentWaitStatus.ACTIVE,
    });

    const response = await page.request.post(
      `/api/agent/v1/runs/${instruction.runId}/wait-conditions/${waitingRun.waits[0]!.id}/responses`,
      {
        headers,
        data: { answer: "Use the finance sense." },
      },
    );
    expect(response.ok()).toBeTruthy();

    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.SUCCEEDED,
    );
  },
);

test(
  "AGENT-007-E2E an approved Proposal commits a notebook item before the Agent resumes",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const notebookResponse = await page.request.post("/api/v1/notebooks", {
      headers,
      data: { name: `Agent notebook ${namespace.value}` },
    });
    expect(notebookResponse.ok()).toBeTruthy();
    const notebook = (await notebookResponse.json()) as { id: string };

    const searchResponse = await page.request.get(
      "/api/v1/lexicon/search?q=bank&limit=1",
    );
    expect(searchResponse.ok()).toBeTruthy();
    const search = (await searchResponse.json()) as {
      data: { headwords: Array<{ headwordId: string }> };
    };
    const headwordId = search.data.headwords[0]?.headwordId;
    expect(headwordId).toBeTruthy();

    const sessionId = await createSession(page, headers, namespace.value);
    const instruction = await submitInstruction(
      page,
      headers,
      sessionId,
      deterministicProviderInstruction(
        DeterministicProviderScenario.PROPOSAL,
        JSON.stringify({
          commandKind: AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD,
          target: { kind: AgentResourceKind.NOTEBOOK, id: notebook.id },
          input: {
            target: { kind: LexicalTargetKind.HEADWORD, id: headwordId },
            note: "Added by the deterministic Agent proposal.",
            tags: ["agent-e2e"],
          },
        }),
      ),
      namespace.idempotencyKey("agent-proposal"),
    );
    expect(instruction.runId).toBeTruthy();

    const submittedEvents = await readSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.PROPOSAL_SUBMITTED,
    });
    const proposalId = submittedEvents.at(-1)?.payload.proposalId;
    if (typeof proposalId !== "string") {
      throw new Error("AGENT_PROPOSAL_ID_MISSING");
    }
    const proposalResponse = await page.request.get(
      `/api/agent/v1/proposals/${proposalId}`,
    );
    expect(proposalResponse.ok()).toBeTruthy();
    const proposal = (await proposalResponse.json()) as AgentProposal;
    expect(proposal).toMatchObject({
      id: proposalId,
      status: AgentProposalStatus.PENDING,
    });

    const decisionResponse = await page.request.post(
      `/api/agent/v1/proposals/${proposalId}/decisions`,
      {
        headers,
        data: {
          decision: AgentProposalDecision.APPROVE,
          actionDigest: proposal.actionDigest,
        },
      },
    );
    expect(decisionResponse.ok()).toBeTruthy();
    const duplicateDecisionResponse = await page.request.post(
      `/api/agent/v1/proposals/${proposalId}/decisions`,
      {
        headers,
        data: {
          decision: AgentProposalDecision.APPROVE,
          actionDigest: proposal.actionDigest,
        },
      },
    );
    expect(duplicateDecisionResponse.ok()).toBeTruthy();
    await expect(duplicateDecisionResponse.json()).resolves.toMatchObject({
      id: proposalId,
      status: AgentProposalStatus.COMMITTED,
    });
    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.SUCCEEDED,
    );

    const itemsResponse = await page.request.get(
      `/api/v1/notebooks/${notebook.id}/items`,
    );
    expect(itemsResponse.ok()).toBeTruthy();
    const items = (await itemsResponse.json()) as Array<{
      id: string;
      targetKind: LexicalTargetKind;
      targetId: string;
      tags: string[];
    }>;
    const committedItems = items.filter(
      (item) =>
        item.targetKind === LexicalTargetKind.HEADWORD &&
        item.targetId === headwordId,
    );
    expect(committedItems).toHaveLength(1);
    expect(committedItems[0]).toMatchObject({ tags: ["agent-e2e"] });
  },
);

test(
  "AGENT-007-OWNER-E2E an Agent Proposal cannot target another learner's Notebook",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY, TestTag.SECURITY),
  },
  async ({ browser, learnerPage: page, namespace }) => {
    const foreignContext = await browser.newContext({
      baseURL: `http://127.0.0.1:${e2ePorts().web}`,
    });
    try {
      const foreignPage = await foreignContext.newPage();
      await registerUserViaApi(foreignPage, namespace, "proposal-owner");
      const foreignHeaders = await authenticatedMutationHeaders(foreignPage);
      const notebookResponse = await foreignPage.request.post(
        "/api/v1/notebooks",
        {
          headers: foreignHeaders,
          data: { name: `Foreign Agent target ${namespace.value}` },
        },
      );
      expect(notebookResponse.ok()).toBeTruthy();
      const notebook = (await notebookResponse.json()) as { id: string };

      const searchResponse = await page.request.get(
        "/api/v1/lexicon/search?q=bank&limit=1",
      );
      expect(searchResponse.ok()).toBeTruthy();
      const search = (await searchResponse.json()) as {
        data: { headwords: Array<{ headwordId: string }> };
      };
      const headwordId = search.data.headwords[0]?.headwordId;
      expect(headwordId).toBeTruthy();

      const headers = await authenticatedMutationHeaders(page);
      const sessionId = await createSession(page, headers, namespace.value);
      const instruction = await submitInstruction(
        page,
        headers,
        sessionId,
        deterministicProviderInstruction(
          DeterministicProviderScenario.PROPOSAL,
          JSON.stringify({
            commandKind: AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD,
            target: { kind: AgentResourceKind.NOTEBOOK, id: notebook.id },
            input: {
              target: { kind: LexicalTargetKind.HEADWORD, id: headwordId },
              note: "This cross-owner write must be denied.",
              tags: ["forbidden"],
            },
          }),
        ),
        namespace.idempotencyKey("agent-proposal-owner-denial"),
      );
      expect(instruction.runId).toBeTruthy();
      await expectRunStatus(
        page,
        sessionId,
        instruction.runId!,
        AgentRunStatus.FAILED,
      );

      const foreignItems = await foreignPage.request.get(
        `/api/v1/notebooks/${notebook.id}/items`,
      );
      expect(foreignItems.ok()).toBeTruthy();
      await expect(foreignItems.json()).resolves.toEqual([]);
    } finally {
      await foreignContext.close();
    }
  },
);

test.describe(
  "deterministic Provider failures",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  () => {
    for (const scenario of [
      DeterministicProviderScenario.FAILURE,
      DeterministicProviderScenario.INVALID_RESPONSE,
      DeterministicProviderScenario.MALFORMED_STREAM,
      DeterministicProviderScenario.TRUNCATED_STREAM,
      DeterministicProviderScenario.DUPLICATE_FRAME,
      DeterministicProviderScenario.RATE_LIMITED,
      DeterministicProviderScenario.SERVER_ERROR,
      DeterministicProviderScenario.TIMEOUT,
    ]) {
      test(`AGENT-004-E2E ${scenario} leaves the Agent run in a terminal failed state`, async ({
        learnerPage: page,
        namespace,
      }) => {
        const headers = await authenticatedMutationHeaders(page);
        const sessionId = await createSession(page, headers, namespace.value);
        const instruction = await submitInstruction(
          page,
          headers,
          sessionId,
          deterministicProviderInstruction(scenario),
          namespace.idempotencyKey(`agent-provider-${scenario}`),
        );
        expect(instruction.runId).toBeTruthy();

        await expectRunStatus(
          page,
          sessionId,
          instruction.runId!,
          AgentRunStatus.FAILED,
          60_000,
        );
        const events = await readSse(page, sessionId, {
          lastEventId: instruction.eventCursor,
          stopAt: AgentEventType.RUN_FAILED,
        });
        expect(events.at(-1)?.type).toBe(AgentEventType.RUN_FAILED);
      });
    }
  },
);

const PROVIDER_SAFETY_CASES = [
  {
    testId: "AGENT-010-UNAUTHORIZED-TOOL-E2E",
    scenario: DeterministicProviderScenario.UNAUTHORIZED_TOOL,
  },
  {
    testId: "AGENT-010-INVALID-TOOL-ARGUMENTS-E2E",
    scenario: DeterministicProviderScenario.INVALID_TOOL_ARGUMENTS,
  },
] as const;

for (const { testId, scenario } of PROVIDER_SAFETY_CASES) {
  test(
    `${testId} rejects adversarial Provider output before Tool execution`,
    {
      tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY, TestTag.SECURITY),
    },
    async ({ learnerPage: page, namespace }) => {
      const headers = await authenticatedMutationHeaders(page);
      const sessionId = await createSession(
        page,
        headers,
        `${namespace.value}-${scenario}`,
      );
      const instruction = await submitInstruction(
        page,
        headers,
        sessionId,
        deterministicProviderInstruction(scenario),
        namespace.idempotencyKey(`agent-provider-safety-${scenario}`),
      );
      expect(instruction.runId).toBeTruthy();

      await expectRunStatus(
        page,
        sessionId,
        instruction.runId!,
        AgentRunStatus.FAILED,
        60_000,
      );
      const events = await readSse(page, sessionId, {
        lastEventId: instruction.eventCursor,
        stopAt: AgentEventType.RUN_FAILED,
      });
      expect(events.at(-1)?.type).toBe(AgentEventType.RUN_FAILED);
      expect(events).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: AgentEventType.TOOL_CALL_COMPLETED,
          }),
        ]),
      );
    },
  );
}

async function createSession(
  page: Page,
  headers: Record<string, string>,
  identity: string,
): Promise<string> {
  const response = await page.request.post("/api/agent/v1/sessions", {
    headers,
    data: { title: `E2E Agent ${identity}` },
  });
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()) as { id: string };
  return session.id;
}

function requiredPayloadString(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new Error(`AGENT_EVENT_${key.toUpperCase()}_MISSING`);
  }
  return value;
}

async function submitInstruction(
  page: Page,
  headers: Record<string, string>,
  sessionId: string,
  content: string,
  idempotencyKey: string,
): Promise<SubmittedInstruction> {
  const response = await page.request.post(
    `/api/agent/v1/sessions/${sessionId}/instructions`,
    {
      headers: { ...headers, "Idempotency-Key": idempotencyKey },
      data: {
        content,
        requestedCapability: CapabilityKey.LEARNING_CHAT,
        idempotencyKey,
        execution: await platformExecution(page, CapabilityKey.LEARNING_CHAT),
      },
    },
  );
  const body = await response.text();
  expect(
    response.ok(),
    `instruction submission failed: HTTP ${response.status()} ${body}`,
  ).toBeTruthy();
  return JSON.parse(body) as SubmittedInstruction;
}

async function platformExecution(
  page: Page,
  capability: CapabilityKey,
): Promise<AgentExecutionSelectionInput> {
  const response = await page.request.get("/api/agent/v1/capabilities");
  const body = await response.text();
  expect(
    response.ok(),
    `capability discovery failed: HTTP ${response.status()} ${body}`,
  ).toBeTruthy();
  const capabilities = JSON.parse(body) as readonly {
    capabilityKey: CapabilityKey;
    allowedRoutes: readonly {
      route: { id: string };
      platformCredentialAvailable: boolean;
    }[];
  }[];
  const route = capabilities
    .find(({ capabilityKey }) => capabilityKey === capability)
    ?.allowedRoutes.find(({ platformCredentialAvailable }) =>
      Boolean(platformCredentialAvailable),
    );
  expect(
    route,
    `no platform route is available for capability ${capability}`,
  ).toBeTruthy();
  return {
    providerRouteReleaseId: route!.route.id,
    credentialSource: AgentCredentialSource.PLATFORM,
  };
}

async function expectRunStatus(
  page: Page,
  sessionId: string,
  runId: string,
  status: AgentRunStatus,
  timeout = 30_000,
): Promise<AgentRun> {
  let matched: AgentRun | null = null;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/agent/v1/sessions/${sessionId}/runs`,
        );
        if (!response.ok()) return null;
        const runs = (await response.json()) as AgentRun[];
        matched = runs.find((run) => run.id === runId) ?? null;
        return matched?.status ?? null;
      },
      { timeout },
    )
    .toBe(status);
  if (!matched) throw new Error("AGENT_RUN_NOT_FOUND");
  return matched;
}
