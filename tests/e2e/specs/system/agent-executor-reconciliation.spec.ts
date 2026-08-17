import {
  AgentCredentialSource,
  AgentEventType,
  type AgentExecutionSelectionInput,
  AgentOwnerCommandKind,
  AgentProposalDecision,
  AgentProposalStatus,
  AgentResourceKind,
  AgentRunFailureCode,
  AgentRunStatus,
  AgentToolKey,
  CapabilityKey,
} from "@sylis/agent-contracts";
import {
  DeterministicProviderScenario,
  deterministicProviderInstruction,
} from "@sylis/agent-contracts/testing";
import { LexicalTargetKind } from "@sylis/api-client/user";
import type { APIRequestContext, Page } from "@playwright/test";

import { authenticatedMutationHeaders } from "../../fixtures/accounts";
import {
  readAgentSse as readSse,
  type AgentSseFrame as SseFrame,
} from "../../fixtures/agent-events";
import { expect, test } from "../../fixtures/test";
import {
  E2eControllableService,
  E2eServiceControlAction,
  E2eStackStage,
  TestTag,
  e2eTags,
  serviceControlUrl,
} from "../../runtime";

interface SubmittedInstruction {
  runId: string | null;
  eventCursor: number;
}

interface AgentRun {
  id: string;
  status: AgentRunStatus;
}

test.describe.configure({ mode: "serial" });

test(
  "AGENT-009-BEFORE-TOOL-E2E an interrupted model activation requires explicit retry instead of automatic replay",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace, request }) => {
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(page, headers, namespace.value);
    const instruction = await submitInstruction(
      page,
      headers,
      sessionId,
      deterministicProviderInstruction(
        DeterministicProviderScenario.DELAY,
        "Explain bank after the deterministic interruption.",
      ),
      namespace.idempotencyKey("agent-crash-before-tool"),
    );
    expect(instruction.runId).toBeTruthy();
    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.RUNNING,
    );

    await restartAgentExecutor(request);
    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.FAILED,
    );
    await expectUnknownOutcomeEvent(page, sessionId, instruction.eventCursor, {
      interruptedMessages: 0,
    });

    const retryKey = namespace.idempotencyKey("agent-crash-explicit-retry");
    const retryResponse = await page.request.post(
      `/api/agent/v1/runs/${instruction.runId}/retry`,
      { headers, data: { idempotencyKey: retryKey } },
    );
    expect(retryResponse.ok()).toBeTruthy();
    const retry = (await retryResponse.json()) as AgentRun;
    expect(retry.id).toBeTruthy();
    expect(retry.id).not.toBe(instruction.runId);
    await expectRunStatus(
      page,
      sessionId,
      retry.id,
      AgentRunStatus.SUCCEEDED,
      45_000,
    );
  },
);

test(
  "AGENT-009-AFTER-TOOL-E2E a persisted Tool result is not executed again after executor interruption",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
  },
  async ({ learnerPage: page, namespace, request }) => {
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(page, headers, namespace.value);
    const instruction = await submitInstruction(
      page,
      headers,
      sessionId,
      deterministicProviderInstruction(
        DeterministicProviderScenario.TOOL_CONTINUATION_DELAY,
        `[tool:${AgentToolKey.LEXICON_SEARCH}] ${JSON.stringify({ queries: ["bank"], limitPerQuery: 1 })}`,
      ),
      namespace.idempotencyKey("agent-crash-after-tool"),
    );
    expect(instruction.runId).toBeTruthy();
    const beforeRestart = await readSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.TOOL_CALL_COMPLETED,
    });
    expect(
      beforeRestart.filter(
        (event) => event.type === AgentEventType.TOOL_CALL_COMPLETED,
      ),
    ).toHaveLength(1);
    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.RUNNING,
    );

    await restartAgentExecutor(request);
    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.FAILED,
    );
    const afterRestart = await expectUnknownOutcomeEvent(
      page,
      sessionId,
      beforeRestart.at(-1)!.id,
      { completedMessages: 1, interruptedMessages: 0 },
    );
    const events = [...beforeRestart, ...afterRestart];
    expect(
      events.filter(
        (event) => event.type === AgentEventType.TOOL_CALL_COMPLETED,
      ),
    ).toHaveLength(1);
  },
);

test(
  "AGENT-009-PROPOSAL-COMMIT-E2E an approved Proposal remains exactly-once when its continuation is interrupted",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY, TestTag.SECURITY),
  },
  async ({ learnerPage: page, namespace, request }) => {
    const headers = await authenticatedMutationHeaders(page);
    const notebookResponse = await page.request.post("/api/v1/notebooks", {
      headers,
      data: { name: `Reconciliation notebook ${namespace.value}` },
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
        DeterministicProviderScenario.PROPOSAL_CONTINUATION_DELAY,
        JSON.stringify({
          commandKind: AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD,
          target: { kind: AgentResourceKind.NOTEBOOK, id: notebook.id },
          input: {
            target: { kind: LexicalTargetKind.HEADWORD, id: headwordId },
            note: "Committed before the continuation interruption.",
            tags: ["reconciliation-e2e"],
          },
        }),
      ),
      namespace.idempotencyKey("agent-crash-after-proposal"),
    );
    expect(instruction.runId).toBeTruthy();
    const proposalEvents = await readSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.PROPOSAL_SUBMITTED,
    });
    const proposalId = proposalEvents.at(-1)?.payload.proposalId;
    expect(typeof proposalId).toBe("string");
    const proposalResponse = await page.request.get(
      `/api/agent/v1/proposals/${proposalId as string}`,
    );
    expect(proposalResponse.ok()).toBeTruthy();
    const proposal = (await proposalResponse.json()) as {
      actionDigest: string;
      status: AgentProposalStatus;
    };
    expect(proposal.status).toBe(AgentProposalStatus.PENDING);
    const decisionResponse = await page.request.post(
      `/api/agent/v1/proposals/${proposalId as string}/decisions`,
      {
        headers,
        data: {
          decision: AgentProposalDecision.APPROVE,
          actionDigest: proposal.actionDigest,
        },
      },
    );
    expect(decisionResponse.ok()).toBeTruthy();
    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.RUNNING,
    );

    await restartAgentExecutor(request);
    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.FAILED,
    );
    const events = await expectUnknownOutcomeEvent(
      page,
      sessionId,
      proposalEvents.at(-1)!.id,
      { completedMessages: 1, interruptedMessages: 0 },
    );
    expect(
      events.filter(
        (event) => event.type === AgentEventType.PROPOSAL_COMMITTED,
      ),
    ).toHaveLength(1);

    const itemsResponse = await page.request.get(
      `/api/v1/notebooks/${notebook.id}/items`,
    );
    expect(itemsResponse.ok()).toBeTruthy();
    const items = (await itemsResponse.json()) as Array<{
      targetKind: LexicalTargetKind;
      targetId: string;
    }>;
    expect(
      items.filter(
        (item) =>
          item.targetKind === LexicalTargetKind.HEADWORD &&
          item.targetId === headwordId,
      ),
    ).toHaveLength(1);
  },
);

async function createSession(
  page: Page,
  headers: Record<string, string>,
  identity: string,
): Promise<string> {
  const response = await page.request.post("/api/agent/v1/sessions", {
    headers,
    data: { title: `Agent reconciliation ${identity}` },
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
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
        execution: await platformExecution(page),
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
): Promise<AgentExecutionSelectionInput> {
  const response = await page.request.get("/api/agent/v1/capabilities");
  expect(response.ok()).toBeTruthy();
  const capabilities = (await response.json()) as readonly {
    capabilityKey: CapabilityKey;
    allowedRoutes: readonly {
      route: { id: string };
      platformCredentialAvailable: boolean;
    }[];
  }[];
  const route = capabilities
    .find(({ capabilityKey }) => capabilityKey === CapabilityKey.LEARNING_CHAT)
    ?.allowedRoutes.find(({ platformCredentialAvailable }) =>
      Boolean(platformCredentialAvailable),
    );
  expect(route).toBeTruthy();
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
): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/agent/v1/sessions/${sessionId}/runs`,
        );
        if (!response.ok()) return null;
        const runs = (await response.json()) as AgentRun[];
        return runs.find((run) => run.id === runId)?.status ?? null;
      },
      { timeout },
    )
    .toBe(status);
}

async function restartAgentExecutor(request: APIRequestContext): Promise<void> {
  const response = await request.post(
    serviceControlUrl(
      E2eControllableService.AGENT_EXECUTOR,
      E2eServiceControlAction.RESTART,
    ),
  );
  expect(response.ok()).toBeTruthy();
  expect((await response.json()) as { stage: E2eStackStage }).toMatchObject({
    stage: E2eStackStage.READY,
  });
}

async function expectUnknownOutcomeEvent(
  page: Page,
  sessionId: string,
  lastEventId: number,
  expectedMessages: {
    completedMessages?: number;
    interruptedMessages?: number;
  } = {},
): Promise<SseFrame[]> {
  const { completedMessages = 0, interruptedMessages = 1 } = expectedMessages;
  const events = await readSse(page, sessionId, {
    lastEventId,
    stopAt: AgentEventType.RUN_FAILED,
  });
  expect(events.at(-1)).toMatchObject({
    type: AgentEventType.RUN_FAILED,
    payload: {
      errorCode: AgentRunFailureCode.EXECUTION_OUTCOME_UNKNOWN,
    },
  });
  expect(
    events.filter(({ type }) => type === AgentEventType.MESSAGE_COMPLETED),
  ).toHaveLength(completedMessages);
  expect(
    events.filter(({ type }) => type === AgentEventType.MESSAGE_INTERRUPTED),
  ).toHaveLength(interruptedMessages);
  return events;
}
