import {
  AgentActivationResultStatus,
  AgentExecutionMode,
  AgentStepActionKind,
  AgentStepCommitStatus,
  AgentStepDirectiveMode,
  AgentStepOutcomeStatus,
  AgentToolConcurrencyMode,
  AgentToolKey,
  CapabilityKey,
  ModelContentBlockKind,
  ModelResponseFinishReason,
  ModelStreamEventType,
  ToolSideEffectClass,
  type AgentActivation,
  type AgentStepProposal,
} from "@sylis/agent-contracts";
import { JobKind } from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { describe, expect, it, vi } from "vitest";

import { AgentApiClient } from "../src/adapters/agent-api-client";
import { ModelGatewayClient } from "../src/adapters/model-gateway-client";
import { PublicWebTools } from "../src/adapters/public-web-tools";
import { SylisTools } from "../src/adapters/sylis-tools";
import { createActivateAgentRunHandler } from "../src/handlers/activate-agent-run";
import { AgentToolExecutor } from "../src/runtime/tool-executor";

const runId = "00000000-0000-4000-8000-000000000001";
const invocationId = "00000000-0000-4000-8000-000000000002";
const actionDigest = `sha256:${"a".repeat(64)}`;

describe("activate Agent Run", () => {
  it("settles a failed Runtime when the Model Gateway cannot open a stream", async () => {
    const settlements: unknown[] = [];
    const agentFetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "GET") return Response.json(activationFixture());
        if (url.endsWith("/runtime-settlement")) {
          settlements.push(JSON.parse(String(init?.body)) as unknown);
          return new Response(null, { status: 204 });
        }
        throw new Error(`UNEXPECTED_AGENT_API_REQUEST:${url}`);
      },
    );
    const handler = createActivateAgentRunHandler({
      agentApi: new AgentApiClient(
        "https://agent-api.invalid",
        "service-token",
        agentFetch as typeof globalThis.fetch,
      ),
      modelGateway: new ModelGatewayClient(
        "https://model-gateway.invalid",
        "service-token",
        vi.fn(async () => new Response(null, { status: 503 })),
      ),
      tools: toolExecutor(),
      maxParallelToolCalls: 2,
    });

    await expect(
      handler(attemptFixture(), executorFixture(vi.fn())),
    ).rejects.toThrow("MODEL_GATEWAY_HTTP_503");
    expect(settlements).toEqual([
      {
        runId,
        status: AgentActivationResultStatus.FAILED,
        completedSteps: 0,
        errorCode: "MODEL_GATEWAY_HTTP_503",
      },
    ]);
  });

  it("starts and records a Tool outcome before committing the Step", async () => {
    const calls: string[] = [];
    const recordedOutcomes: unknown[] = [];
    const agentFetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "GET") return Response.json(activationFixture());
        if (url.endsWith("/steps/preflight")) {
          calls.push("preflight");
          const proposal = JSON.parse(String(init?.body)) as AgentStepProposal;
          const action = proposal.actions[0];
          if (!action || action.kind !== AgentStepActionKind.DOMAIN_TOOL) {
            throw new Error("EXPECTED_DOMAIN_TOOL_ACTION");
          }
          return Response.json({
            runId,
            stepId: proposal.stepId,
            invocationId,
            directives: [
              {
                mode: AgentStepDirectiveMode.EXECUTE,
                kind: AgentStepActionKind.DOMAIN_TOOL,
                actionId: action.actionId,
                modelPosition: action.modelPosition,
                concurrencyMode: AgentToolConcurrencyMode.PARALLEL_SAFE,
                tool: {
                  toolCallId: action.actionId,
                  toolKey: action.toolKey,
                  schemaVersion: action.schemaVersion,
                  input: action.input,
                  actionDigest: action.actionDigest,
                  timeoutMs: 1_000,
                },
              },
            ],
          });
        }
        if (url.endsWith("/start")) {
          calls.push("start");
          return new Response(null, { status: 204 });
        }
        if (url.endsWith("/outcome")) {
          calls.push("outcome");
          recordedOutcomes.push(JSON.parse(String(init?.body)) as unknown);
          return new Response(null, { status: 204 });
        }
        if (url.endsWith("/commit")) {
          calls.push("commit");
          return Response.json({ status: AgentStepCommitStatus.COMPLETED });
        }
        throw new Error(`UNEXPECTED_AGENT_API_REQUEST:${url}`);
      },
    );
    const modelFetch = vi.fn(async () =>
      ndjsonResponse([
        {
          type: ModelStreamEventType.INVOCATION_STARTED,
          invocationId,
          attemptOrdinal: 0,
        },
        {
          type: ModelStreamEventType.BLOCK_COMPLETED,
          invocationId,
          block: {
            kind: ModelContentBlockKind.TOOL_CALL,
            modelPosition: 0,
            providerCallId: "provider-call-1",
            providerName: "sylis_tool_0",
            input: { query: "example" },
          },
        },
        {
          type: ModelStreamEventType.RESPONSE_COMPLETED,
          invocationId,
          finishReason: ModelResponseFinishReason.TOOL_CALLS,
        },
      ]),
    );
    const handler = createActivateAgentRunHandler({
      agentApi: new AgentApiClient(
        "https://agent-api.invalid",
        "service-token",
        agentFetch as typeof globalThis.fetch,
      ),
      modelGateway: new ModelGatewayClient(
        "https://model-gateway.invalid",
        "service-token",
        modelFetch as typeof globalThis.fetch,
      ),
      tools: toolExecutor(
        vi.fn(async () => new Response(null, { status: 503 })),
      ),
      maxParallelToolCalls: 2,
    });

    await expect(
      handler(attemptFixture(), executorFixture(vi.fn())),
    ).resolves.toEqual({ resultType: "agent-run", resultId: runId });
    expect(calls).toEqual(["preflight", "start", "outcome", "commit"]);
    expect(recordedOutcomes).toHaveLength(1);
    expect(recordedOutcomes[0]).toMatchObject({
      runId,
      invocationId,
      outcome: {
        status: AgentStepOutcomeStatus.FAILED,
        errorCode: "SYLIS_TOOL_HTTP_503",
      },
    });
  });

  it("preserves the Agent API problem code when Step preflight fails", async () => {
    const settlements: unknown[] = [];
    const agentFetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "GET") return Response.json(activationFixture());
        if (url.endsWith("/steps/preflight")) {
          return Response.json(
            {
              type: "https://sylis.app/problems/409",
              title: "CONFLICT",
              status: 409,
              code: "AGENT_TOOL_GRANT_EXHAUSTED",
              detail: "AGENT_TOOL_GRANT_EXHAUSTED",
            },
            {
              status: 409,
              headers: { "content-type": "application/problem+json" },
            },
          );
        }
        if (url.endsWith("/runtime-settlement")) {
          settlements.push(JSON.parse(String(init?.body)) as unknown);
          return new Response(null, { status: 204 });
        }
        throw new Error(`UNEXPECTED_AGENT_API_REQUEST:${url}`);
      },
    );
    const modelFetch = vi.fn(async () =>
      ndjsonResponse([
        {
          type: ModelStreamEventType.INVOCATION_STARTED,
          invocationId,
          attemptOrdinal: 0,
        },
        {
          type: ModelStreamEventType.BLOCK_COMPLETED,
          invocationId,
          block: {
            kind: ModelContentBlockKind.TOOL_CALL,
            modelPosition: 0,
            providerCallId: "provider-call-1",
            providerName: "sylis_tool_0",
            input: { query: "example" },
          },
        },
        {
          type: ModelStreamEventType.RESPONSE_COMPLETED,
          invocationId,
          finishReason: ModelResponseFinishReason.TOOL_CALLS,
        },
      ]),
    );
    const handler = createActivateAgentRunHandler({
      agentApi: new AgentApiClient(
        "https://agent-api.invalid",
        "service-token",
        agentFetch as typeof globalThis.fetch,
      ),
      modelGateway: new ModelGatewayClient(
        "https://model-gateway.invalid",
        "service-token",
        modelFetch as typeof globalThis.fetch,
      ),
      tools: toolExecutor(),
      maxParallelToolCalls: 2,
    });

    await expect(
      handler(attemptFixture(), executorFixture(vi.fn())),
    ).rejects.toThrow("AGENT_TOOL_GRANT_EXHAUSTED");
    expect(settlements).toEqual([
      {
        runId,
        status: AgentActivationResultStatus.FAILED,
        completedSteps: 0,
        errorCode: "AGENT_TOOL_GRANT_EXHAUSTED",
      },
    ]);
  });
});

function activationFixture(): AgentActivation {
  return {
    sessionId: "00000000-0000-4000-8000-000000000003",
    runId,
    rootRunId: runId,
    userId: "00000000-0000-4000-8000-000000000004",
    goal: "Find example.",
    systemPrompt: "Use verified Sylis tools.",
    requestedCapability: CapabilityKey.LEXICON_EXPLAIN,
    capabilityReleaseId: "00000000-0000-4000-8000-000000000005",
    providerRouteReleaseId: "00000000-0000-4000-8000-000000000006",
    credentialRevisionId: "00000000-0000-4000-8000-000000000007",
    modelExecutionPermitId: "00000000-0000-4000-8000-000000000008",
    executionMode: AgentExecutionMode.AGENT_LOOP,
    context: { refs: [], timezone: "UTC", locale: "en" },
    contextEvidence: [],
    plan: [],
    tools: [
      {
        toolKey: AgentToolKey.LEXICON_SEARCH,
        schemaVersion: "1",
        owner: "api",
        sideEffectClass: ToolSideEffectClass.READ_PUBLIC,
        requiredScopes: ["lexicon:read"],
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        timeoutMs: 1_000,
        maxCalls: 1,
      },
    ],
    skills: [],
    toolEvidence: [],
    artifactEvidence: [],
    waitEvidence: [],
    proposalEvidence: [],
    nextStepOrdinal: 0,
    maxSteps: 4,
    maxToolCalls: 2,
    maxChildRuns: 0,
    maxOutputTokens: 512,
  };
}

function attemptFixture(): ClaimedAttempt {
  return {
    jobId: "00000000-0000-4000-8000-000000000009",
    attemptId: "00000000-0000-4000-8000-000000000010",
    attemptNumber: 1,
    kind: JobKind.AGENT_RUN_ACTIVATION,
    inputRef: { requestId: runId },
    inputHash: actionDigest,
    handlerVersion: "agent-executor/1",
    checkpointSchemaVersion: "agent-executor/1",
    fencingToken: 1n,
    leaseToken: "lease",
    leaseExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    checkpoint: null,
  };
}

function executorFixture(progress: JobExecutor["progress"]): JobExecutor {
  return {
    claim: async () => null,
    heartbeat: async () => undefined,
    checkpoint: async () => undefined,
    progress,
    isCancellationRequested: async () => false,
    finish: async () => undefined,
    fail: async () => undefined,
  };
}

function toolExecutor(
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): AgentToolExecutor {
  return new AgentToolExecutor(
    new PublicWebTools({
      braveSearchApiKey: "test-key",
      searchTimeoutMs: 1_000,
      pageTimeoutMs: 1_000,
      maxPageBytes: 100_000,
      maxRedirects: 1,
    }),
    new SylisTools("https://api.invalid", "service-token", fetchImplementation),
  );
}

function ndjsonResponse(events: readonly unknown[]): Response {
  return new Response(
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    {
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
    },
  );
}
