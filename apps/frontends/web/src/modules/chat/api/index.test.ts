import {
  AgentCredentialSource,
  AgentExecutionMode,
  AgentMessageRole,
  AgentMessageVisibility,
  AgentRunStatus,
  CapabilityKey,
  CapabilitySelection,
  agentClient,
  type AgentCapabilityView,
  type AgentRunView,
} from '@sylis/api-client/agent';
import { MessageRole, type StreamChatReqDto } from '@/legacy-dto';
import { describe, expect, it, vi } from 'vitest';

import { streamChat } from './index';

const eventLease = vi.hoisted(() => ({
  ready: vi.fn().mockResolvedValue(undefined),
  waitForRun: vi.fn(),
  close: vi.fn(),
}));

vi.mock('../../agent/api/session-event-hub', () => ({
  acquireAgentSessionEvents: () => eventLease,
}));

describe('legacy chat agent bridge', () => {
  it('lets the Agent API resolve the capability from the learner instruction', async () => {
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
        createdAt: '2026-08-14T00:00:00.000Z',
        content: 'analysis',
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
        requestedCapability: CapabilitySelection.AUTO,
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
});
