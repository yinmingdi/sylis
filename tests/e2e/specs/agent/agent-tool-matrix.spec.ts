import {
  AgentCredentialSource,
  AgentEventType,
  type AgentExecutionSelectionInput,
  AgentRunStatus,
  AgentToolKey,
  CapabilityKey,
} from "@sylis/agent-contracts";
import { AGENT_RUNTIME_FIXTURE_IDS } from "@sylis/agent-contracts/release-fixtures";
import type { Page } from "@playwright/test";

import { authenticatedMutationHeaders } from "../../fixtures/accounts";
import { readAgentSse } from "../../fixtures/agent-events";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

type ReadToolKey = Exclude<
  AgentToolKey,
  AgentToolKey.NOTEBOOK_ITEM_ADD | AgentToolKey.READING_DOCUMENT_PUBLISH
>;

interface ToolMatrixCase {
  key: ReadToolKey;
  validInput: (page: Page) => Promise<Readonly<Record<string, unknown>>>;
  invalidInput: Readonly<Record<string, unknown>>;
}

interface SubmittedInstruction {
  runId: string | null;
  eventCursor: number;
}

interface AgentRun {
  id: string;
  status: AgentRunStatus;
}

const READ_TOOL_CASES = [
  {
    key: AgentToolKey.WEB_SEARCH,
    validInput: async () => ({ query: "bank vocabulary", count: 1 }),
    invalidInput: {},
  },
  {
    key: AgentToolKey.WEB_PAGE_READ,
    validInput: async () => ({
      url: "https://source-fixture/public-web-article.html",
      maxCharacters: 2_000,
    }),
    invalidInput: { url: "http://source-fixture/public-web-article.html" },
  },
  {
    key: AgentToolKey.LEXICON_SEARCH,
    validInput: async () => ({ query: "bank", limit: 1 }),
    invalidInput: { query: "bank", limit: 21 },
  },
  {
    key: AgentToolKey.LEXICON_ENTRY_READ,
    validInput: async (page) => ({ entryId: await lexiconEntryId(page) }),
    invalidInput: { entryId: "not-a-uuid" },
  },
  {
    key: AgentToolKey.LEARNING_TODAY_READ,
    validInput: async () => ({}),
    invalidInput: { unexpected: true },
  },
  {
    key: AgentToolKey.READING_DOCUMENT_READ,
    validInput: async () => ({
      documentId: AGENT_RUNTIME_FIXTURE_IDS.readingDocument,
    }),
    invalidInput: {},
  },
  {
    key: AgentToolKey.NOTEBOOK_LIST,
    validInput: async () => ({}),
    invalidInput: { unexpected: true },
  },
] as const satisfies readonly ToolMatrixCase[];

for (const toolCase of READ_TOOL_CASES) {
  test(
    `AGENT-006-TOOL-SUCCESS-E2E ${toolCase.key} completes through its released Tool boundary`,
    {
      tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
    },
    async ({ learnerPage: page, namespace }) => {
      const headers = await authenticatedMutationHeaders(page);
      const sessionId = await createSession(
        page,
        headers,
        `${namespace.value}-${toolCase.key}`,
      );
      const instruction = await submitToolInstruction(
        page,
        headers,
        sessionId,
        toolCase.key,
        await toolCase.validInput(page),
        namespace.idempotencyKey(`tool-success-${toolCase.key}`),
      );
      expect(instruction.runId).toBeTruthy();

      await expectRunStatus(
        page,
        sessionId,
        instruction.runId!,
        AgentRunStatus.SUCCEEDED,
      );
      const events = await readAgentSse(page, sessionId, {
        lastEventId: instruction.eventCursor,
        stopAt: AgentEventType.RUN_COMPLETED,
      });
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: AgentEventType.TOOL_CALL_COMPLETED,
            payload: expect.objectContaining({ toolKey: toolCase.key }),
          }),
          expect.objectContaining({ type: AgentEventType.RUN_COMPLETED }),
        ]),
      );
    },
  );

  test(
    `AGENT-006-TOOL-SCHEMA-E2E ${toolCase.key} rejects invalid input before execution`,
    {
      tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY),
    },
    async ({ learnerPage: page, namespace }) => {
      const headers = await authenticatedMutationHeaders(page);
      const sessionId = await createSession(
        page,
        headers,
        `${namespace.value}-invalid-${toolCase.key}`,
      );
      const instruction = await submitToolInstruction(
        page,
        headers,
        sessionId,
        toolCase.key,
        toolCase.invalidInput,
        namespace.idempotencyKey(`tool-schema-${toolCase.key}`),
      );
      expect(instruction.runId).toBeTruthy();

      await expectRunStatus(
        page,
        sessionId,
        instruction.runId!,
        AgentRunStatus.FAILED,
      );
      const events = await readAgentSse(page, sessionId, {
        lastEventId: instruction.eventCursor,
        stopAt: AgentEventType.RUN_FAILED,
      });
      expect(events.at(-1)?.type).toBe(AgentEventType.RUN_FAILED);
      expect(events).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: AgentEventType.TOOL_CALL_COMPLETED }),
        ]),
      );
    },
  );
}

test(
  "AGENT-010-INDIRECT-INJECTION-E2E malicious webpage instructions remain inert Tool evidence",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.NIGHTLY, TestTag.SECURITY),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const sessionId = await createSession(
      page,
      headers,
      `${namespace.value}-indirect-injection`,
    );
    const instruction = await submitToolInstruction(
      page,
      headers,
      sessionId,
      AgentToolKey.WEB_PAGE_READ,
      {
        url: "https://source-fixture/malicious-prompt-injection.html",
        maxCharacters: 2_000,
      },
      namespace.idempotencyKey("indirect-prompt-injection"),
    );
    expect(instruction.runId).toBeTruthy();

    await expectRunStatus(
      page,
      sessionId,
      instruction.runId!,
      AgentRunStatus.SUCCEEDED,
    );
    const events = await readAgentSse(page, sessionId, {
      lastEventId: instruction.eventCursor,
      stopAt: AgentEventType.RUN_COMPLETED,
    });
    const completedTools = events.filter(
      ({ type }) => type === AgentEventType.TOOL_CALL_COMPLETED,
    );
    expect(completedTools).toHaveLength(1);
    expect(completedTools[0]?.payload).toMatchObject({
      toolKey: AgentToolKey.WEB_PAGE_READ,
    });
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: AgentEventType.PROPOSAL_SUBMITTED }),
      ]),
    );
  },
);

async function lexiconEntryId(page: Page): Promise<string> {
  const response = await page.request.get(
    "/api/v1/lexicon/search?q=bank&limit=1",
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    data: { headwords: Array<{ entries: Array<{ entryId: string }> }> };
  };
  const entryId = body.data.headwords[0]?.entries[0]?.entryId;
  expect(entryId).toBeTruthy();
  return entryId!;
}

async function createSession(
  page: Page,
  headers: Record<string, string>,
  title: string,
): Promise<string> {
  const response = await page.request.post("/api/agent/v1/sessions", {
    headers,
    data: { title: `Tool matrix ${title}` },
  });
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()) as { id: string };
  return session.id;
}

async function submitToolInstruction(
  page: Page,
  headers: Record<string, string>,
  sessionId: string,
  toolKey: ReadToolKey,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey: string,
): Promise<SubmittedInstruction> {
  const response = await page.request.post(
    `/api/agent/v1/sessions/${sessionId}/instructions`,
    {
      headers: { ...headers, "Idempotency-Key": idempotencyKey },
      data: {
        content: `[tool:${toolKey}] ${JSON.stringify(input)}`,
        requestedCapability: CapabilityKey.LEARNING_CHAT,
        idempotencyKey,
        execution: await platformExecution(page),
      },
    },
  );
  const body = await response.text();
  expect(
    response.ok(),
    `Tool instruction failed: HTTP ${response.status()} ${body}`,
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
      { timeout: 30_000 },
    )
    .toBe(status);
}
