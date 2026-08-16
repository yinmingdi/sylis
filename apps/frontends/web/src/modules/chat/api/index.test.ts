import {
  AgentCredentialSource,
  AgentExecutionMode,
  AgentMessageStatus,
  AgentMessageRole,
  AgentMessageVisibility,
  AgentRunStatus,
  AgentWaitKind,
  AgentWaitStatus,
  CapabilityKey,
  agentClient,
  type AgentCapabilityView,
  type AgentRunView,
} from '@sylis/api-client/agent';
import { MessageRole, type StreamChatReqDto } from '@/legacy-dto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamChat } from './index';

const eventLease = vi.hoisted(() => ({
  ready: vi.fn().mockResolvedValue(undefined),
  snapshot: vi.fn().mockReturnValue({ cursor: 0, runs: [] }),
  waitForRun: vi.fn(),
  close: vi.fn(),
}));

vi.mock('../../agent/api/session-event-hub', () => ({
  acquireAgentSessionEvents: () => eventLease,
}));

describe('legacy chat agent bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    eventLease.ready.mockResolvedValue(undefined);
    eventLease.snapshot.mockReturnValue({ cursor: 0, runs: [] });
    eventLease.waitForRun.mockReset();
    eventLease.close.mockReset();
  });

  it('keeps the legacy chat surface on the conversational capability', async () => {
    const capability: AgentCapabilityView = {
      capabilityKey: CapabilityKey.LEARNING_CHAT,
      version: '1',
      executionMode: AgentExecutionMode.SINGLE_CALL,
      releaseDigest: 'test-release',
      allowedRoutes: [
        {
          route: {
            id: 'route-release',
            providerKey: 'deepseek',
            modelId: 'deepseek-v4-flash',
          },
          platformCredentialAvailable: true,
        },
      ],
      credentials: [],
    };
    const run = {
      id: 'run-id',
      status: AgentRunStatus.SUCCEEDED,
    } as AgentRunView;

    vi.spyOn(agentClient, 'capabilities').mockResolvedValue([capability]);
    const messages = vi
      .spyOn(agentClient.sessions, 'messages')
      .mockResolvedValue([]);
    const runs = vi.spyOn(agentClient.sessions, 'runs').mockResolvedValue([]);
    const submitInstruction = vi
      .spyOn(agentClient.sessions, 'submitInstruction')
      .mockResolvedValue({
        instructionId: 'instruction-id',
        runId: run.id,
        eventCursor: 1,
        run,
      });
    eventLease.waitForRun.mockResolvedValue({
      runId: run.id,
      status: AgentRunStatus.SUCCEEDED,
      message: {
        id: 'message-id',
        role: AgentMessageRole.ASSISTANT,
        sequence: 2,
        visibility: AgentMessageVisibility.USER,
        status: AgentMessageStatus.COMPLETED,
        createdAt: '2026-08-14T00:00:00.000Z',
        blocks: [],
      },
    });

    await streamChat(
      {
        sessionId: 'session-id',
        messages: [
          {
            role: MessageRole.user,
            content:
              '帮我分析一下 A Programming Paradigm for Spatiotemporal Composability 语法',
          },
        ],
      } as StreamChatReqDto,
      {},
    );

    expect(submitInstruction).toHaveBeenCalledWith(
      'session-id',
      expect.objectContaining({
        requestedCapability: CapabilityKey.LEARNING_CHAT,
        execution: {
          providerRouteReleaseId: 'route-release',
          credentialSource: AgentCredentialSource.PLATFORM,
        },
      }),
    );
    expect(messages).not.toHaveBeenCalled();
    expect(runs).not.toHaveBeenCalled();
    expect(eventLease.waitForRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: run.id, after: 1 }),
    );
  });

  it('uses the next chat message to resume an active learner-input wait', async () => {
    eventLease.snapshot.mockReturnValue({
      cursor: 12,
      runs: [
        {
          id: 'waiting-run-id',
          status: AgentRunStatus.WAITING,
          waits: [
            {
              id: 'wait-id',
              kind: AgentWaitKind.USER_INPUT,
              status: AgentWaitStatus.ACTIVE,
            },
          ],
        },
      ],
    });
    eventLease.waitForRun.mockResolvedValue({
      runId: 'waiting-run-id',
      status: AgentRunStatus.WAITING,
    });
    const respondToWait = vi
      .spyOn(agentClient.runs, 'respondToWait')
      .mockResolvedValue(undefined);
    const submitInstruction = vi.spyOn(
      agentClient.sessions,
      'submitInstruction',
    );
    const onChunk = vi.fn();

    await streamChat(
      {
        sessionId: 'session-id',
        messages: [{ role: MessageRole.user, content: '我是初学者' }],
      } as StreamChatReqDto,
      { onChunk },
    );

    expect(respondToWait).toHaveBeenCalledWith('waiting-run-id', 'wait-id', {
      value: '我是初学者',
    });
    expect(submitInstruction).not.toHaveBeenCalled();
    expect(eventLease.waitForRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'waiting-run-id', after: 12 }),
    );
    expect(onChunk).toHaveBeenCalledWith(
      '我还需要一些信息，请直接回复后继续。',
    );
  });
});
