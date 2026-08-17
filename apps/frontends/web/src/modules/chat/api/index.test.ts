import {
  AgentCredentialSource,
  AgentExecutionMode,
  AgentRunStatus,
  AgentSessionStatus,
  AgentWaitKind,
  AgentWaitStatus,
  CapabilityKey,
  agentClient,
  type AgentCapabilityView,
  type AgentRunView,
} from '@sylis/api-client/agent';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSessions, submitAgentChat } from './index';

describe('chat Agent commands', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads the session list without one message request per session', async () => {
    vi.spyOn(agentClient.sessions, 'list').mockResolvedValue([
      session('session-1', 'First'),
      session('session-2', 'Second'),
    ]);
    const messages = vi.spyOn(agentClient.sessions, 'messages');

    await expect(getSessions()).resolves.toMatchObject({
      data: { total: 2, sessions: [{ id: 'session-1' }, { id: 'session-2' }] },
    });
    expect(messages).not.toHaveBeenCalled();
  });

  it('submits one conversational command without polling messages or Runs', async () => {
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
    const run = { id: 'run-id', status: AgentRunStatus.QUEUED } as AgentRunView;
    vi.spyOn(agentClient, 'capabilities').mockResolvedValue([capability]);
    const messages = vi.spyOn(agentClient.sessions, 'messages');
    const runs = vi.spyOn(agentClient.sessions, 'runs');
    const submitInstruction = vi
      .spyOn(agentClient.sessions, 'submitInstruction')
      .mockResolvedValue({
        instructionId: 'instruction-id',
        runId: run.id,
        eventCursor: 1,
        run,
      });

    await submitAgentChat({
      sessionId: 'session-id',
      instruction:
        '帮我分析一下 A Programming Paradigm for Spatiotemporal Composability 语法',
      runs: [],
    });

    expect(submitInstruction).toHaveBeenCalledTimes(1);
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
  });

  it('uses the next message to resume an active learner-input wait', async () => {
    const waitingRun = {
      id: 'waiting-run-id',
      status: AgentRunStatus.WAITING,
      waits: [
        {
          id: 'wait-id',
          kind: AgentWaitKind.USER_INPUT,
          status: AgentWaitStatus.ACTIVE,
        },
      ],
    } as unknown as AgentRunView;
    const respondToWait = vi
      .spyOn(agentClient.runs, 'respondToWait')
      .mockResolvedValue(undefined);
    const submitInstruction = vi.spyOn(
      agentClient.sessions,
      'submitInstruction',
    );

    await expect(
      submitAgentChat({
        sessionId: 'session-id',
        instruction: '我是初学者',
        runs: [waitingRun],
      }),
    ).resolves.toMatchObject({ resumedRunId: waitingRun.id });

    expect(respondToWait).toHaveBeenCalledWith('waiting-run-id', 'wait-id', {
      value: '我是初学者',
    });
    expect(submitInstruction).not.toHaveBeenCalled();
  });
});

function session(id: string, title: string) {
  return {
    id,
    title,
    status: AgentSessionStatus.ACTIVE,
    createdAt: '2026-08-14T00:00:00.000Z',
    archivedAt: null,
  };
}
