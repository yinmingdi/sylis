import {
  AgentEventType,
  AgentRunStatus,
  AgentWaitStatus,
  CapabilityKey,
  CapabilitySelection,
  type AgentSessionView,
  type AgentExecutionSelectionInput,
  type AgentMessageView,
  type AgentRunView,
  type AgentStreamEvent,
  type AgentWaitConditionView,
} from '@sylis/api-client/agent';
import {
  ArrowLeft,
  History,
  IconButton,
  Plus,
  StatusBadge,
} from '@sylis/components';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import {
  AgentEventTimeline,
  AgentInspector,
  AgentMessageComposer,
  AgentRunPlan,
  AgentRunStatusView,
  AgentSessionDrawer,
  AgentStreamConnectionState,
  AgentTimelineActionType,
  AgentWaitCondition,
  agentCommands,
  agentQueries,
  initialAgentTimelineState,
  addComposerContext,
  contextSelectionFromSearchParams,
  instructionContext,
  parseAgentInspection,
  agentLearningWorkflowPreset,
  defaultAgentExecutionSelection,
  requestedAgentLearningWorkflow,
  requestedAgentWorkflowLaunch,
  removeComposerContext,
  reduceAgentTimeline,
  reduceAgentMessages,
  reduceAgentRuns,
  acquireAgentSessionEvents,
  type AgentCapabilitySelection,
  type AgentInspection,
  type AgentComposerContextItem,
} from '../../modules/agent';
import { useCurrentUserId } from '../../modules/identity';

export function AgentSessionPage() {
  const userId = useCurrentUserId();
  const { sessionId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const sessions = useQuery(agentQueries.sessions(userId));
  const session = useQuery({
    ...agentQueries.session(userId, sessionId),
    enabled: false,
  });
  const messages = useQuery({
    ...agentQueries.messages(userId, sessionId),
    enabled: false,
  });
  const runs = useQuery({
    ...agentQueries.runs(userId, sessionId),
    enabled: false,
  });
  const assets = useQuery(agentQueries.assets(userId));
  const capabilities = useQuery(agentQueries.capabilities(userId));
  const [timeline, dispatch] = useReducer(
    reduceAgentTimeline,
    initialAgentTimelineState,
  );
  const [streamState, setStreamState] = useState(
    AgentStreamConnectionState.CONNECTING,
  );
  const workflow = requestedAgentLearningWorkflow(searchParams.get('workflow'));
  const workflowPreset = workflow
    ? agentLearningWorkflowPreset(workflow)
    : null;
  const launch = requestedAgentWorkflowLaunch(location.state);
  const initialCapability =
    workflowPreset?.capability ??
    requestedCapability(searchParams.get('capability'));
  const initialContent = launch?.content ?? workflowPreset?.draft ?? '';
  const inspection = parseAgentInspection(searchParams);
  const externalContext = useMemo(
    () => contextSelectionFromSearchParams(searchParams),
    [searchParams],
  );
  const [contextItems, setContextItems] = useState<
    readonly AgentComposerContextItem[]
  >([]);
  const [contextError, setContextError] = useState<string>();
  const [launchError, setLaunchError] = useState<string>();
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const submittedLaunchRef = useRef<string | undefined>(undefined);
  const handledEventRef = useRef({ sessionId: '', sequence: 0 });

  useEffect(() => {
    if (!externalContext) return;
    setContextItems((current) => addComposerContext(current, externalContext));
  }, [externalContext]);

  useEffect(() => {
    if (handledEventRef.current.sessionId !== sessionId) {
      handledEventRef.current = { sessionId, sequence: 0 };
      dispatch({ type: AgentTimelineActionType.RESET });
    }
    const events = acquireAgentSessionEvents(sessionId);
    const unsubscribe = events.subscribe({
      onSnapshot: (snapshot) => {
        handledEventRef.current.sequence = snapshot.cursor;
        cache.setQueryData(
          agentQueries.session(userId, sessionId).queryKey,
          snapshot.session,
        );
        cache.setQueryData(agentQueries.messages(userId, sessionId).queryKey, [
          ...snapshot.messages,
        ]);
        cache.setQueryData(agentQueries.runs(userId, sessionId).queryKey, [
          ...snapshot.runs,
        ]);
      },
      onEvent: (event) => {
        if (event.sequence <= handledEventRef.current.sequence) return;
        handledEventRef.current.sequence = event.sequence;
        dispatch({ type: AgentTimelineActionType.EVENT_RECEIVED, event });
        updateCachedRun(cache, userId, sessionId, event);
        cache.setQueryData<readonly AgentMessageView[]>(
          agentQueries.messages(userId, sessionId).queryKey,
          (current = []) => reduceAgentMessages(current, event),
        );
        if (event.type === AgentEventType.ARTIFACT_REVISION_PROPOSED) {
          const artifactId = event.payload.artifactId;
          if (typeof artifactId === 'string' && artifactId) {
            setSearchParams(
              (current) => {
                const next = new URLSearchParams(current);
                next.delete('proposal');
                next.set('artifact', artifactId);
                return next;
              },
              { replace: true },
            );
          }
        }
        if (event.type === AgentEventType.PROPOSAL_COMMITTED) {
          const proposalId = event.payload.proposalId;
          if (typeof proposalId === 'string' && proposalId) {
            void cache.invalidateQueries({
              queryKey: agentQueries.proposal(userId, proposalId).queryKey,
            });
          }
        }
      },
      onStateChange: setStreamState,
    });
    return () => {
      unsubscribe();
      events.close();
    };
  }, [cache, sessionId, setSearchParams, userId]);

  const create = useMutation({
    mutationFn: () => agentCommands.sessions.create('新会话'),
    onSuccess: async (value: AgentSessionView) => {
      setSessionDrawerOpen(false);
      await cache.invalidateQueries({
        queryKey: agentQueries.sessions(userId).queryKey,
      });
      navigate(`/agent/sessions/${value.id}`);
    },
  });
  const send = useMutation({
    mutationFn: (input: {
      content: string;
      capability: AgentCapabilitySelection;
      contextItems: readonly AgentComposerContextItem[];
      execution: AgentExecutionSelectionInput;
    }) =>
      agentCommands.sessions.submitInstruction(sessionId, {
        content: input.content,
        requestedCapability: input.capability,
        idempotencyKey: crypto.randomUUID(),
        context: instructionContext(input.contextItems),
        execution: input.execution,
      }),
    onSuccess: (submission) => {
      setContextItems([]);
      cache.setQueryData<readonly AgentRunView[]>(
        agentQueries.runs(userId, sessionId).queryKey,
        (current = []) => [
          submission.run,
          ...current.filter((run) => run.id !== submission.run.id),
        ],
      );
      if (submission.userMessage) {
        cache.setQueryData<readonly AgentMessageView[]>(
          agentQueries.messages(userId, sessionId).queryKey,
          (current = []) => [...current, submission.userMessage!],
        );
      }
    },
  });

  useEffect(() => {
    if (
      !launch ||
      capabilities.isPending ||
      session.isPending ||
      submittedLaunchRef.current === launch.idempotencyKey ||
      (externalContext && contextItems.length === 0)
    ) {
      return;
    }
    const execution = defaultAgentExecutionSelection(
      capabilities.data ?? [],
      launch.capability,
    );
    if (!execution) {
      setLaunchError('当前能力没有可用的模型或凭证，请先在我的设置中配置。');
      return;
    }
    submittedLaunchRef.current = launch.idempotencyKey;
    setLaunchError(undefined);
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
    send.mutate({
      content: launch.content,
      capability: launch.capability,
      contextItems,
      execution,
    });
  }, [
    capabilities.data,
    capabilities.isPending,
    contextItems,
    externalContext,
    launch,
    location.pathname,
    location.search,
    navigate,
    send,
    session.isPending,
  ]);
  const latestRun = runs.data?.find((run) => run.parentRunId === null);
  const childRuns = latestRun
    ? (runs.data ?? []).filter((run) => run.parentRunId === latestRun.id)
    : [];
  const cancel = useMutation({
    mutationFn: () => agentCommands.runs.cancel(latestRun!.id),
    onSuccess: (run) => setCachedRun(cache, userId, sessionId, run),
  });
  const retry = useMutation({
    mutationFn: () =>
      agentCommands.runs.retry(latestRun!.id, crypto.randomUUID()),
    onSuccess: (run) => setCachedRun(cache, userId, sessionId, run),
  });
  const respond = useMutation({
    mutationFn: ({
      wait,
      value,
    }: {
      wait: AgentWaitConditionView;
      value: string;
    }) => agentCommands.runs.respondToWait(latestRun!.id, wait.id, { value }),
    onSuccess: (_value, input) => {
      cache.setQueryData<readonly AgentRunView[]>(
        agentQueries.runs(userId, sessionId).queryKey,
        (current = []) =>
          current.map((run) =>
            run.id === latestRun?.id
              ? {
                  ...run,
                  status: AgentRunStatus.QUEUED,
                  waitedAt: null,
                  waits: run.waits.map((wait) =>
                    wait.id === input.wait.id
                      ? {
                          ...wait,
                          status: AgentWaitStatus.SATISFIED,
                          satisfiedAt: new Date().toISOString(),
                          resultRef: { value: input.value },
                        }
                      : wait,
                  ),
                }
              : run,
          ),
      );
    },
  });

  const inspect = (value: AgentInspection) => {
    const next = new URLSearchParams(searchParams);
    next.delete('artifact');
    next.delete('proposal');
    next.set(value.kind.toLocaleLowerCase(), value.id);
    setSearchParams(next);
  };
  const closeInspector = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('artifact');
    next.delete('proposal');
    setSearchParams(next);
  };
  const addContext = (item: AgentComposerContextItem) => {
    try {
      setContextItems((current) => addComposerContext(current, item));
      setContextError(undefined);
    } catch (error) {
      setContextError(
        error instanceof Error ? error.message : '无法加入上下文',
      );
    }
  };

  if (session.isPending)
    return <div className="app-boot" role="status" aria-label="正在载入" />;
  if (session.error) {
    return (
      <div className="page">
        <p className="form-error">{session.error.message}</p>
      </div>
    );
  }

  return (
    <div className="agent-workspace" data-has-session="true">
      <AgentSessionDrawer
        open={sessionDrawerOpen}
        sessions={sessions.data ?? []}
        creating={create.isPending}
        onCreate={() => create.mutate()}
        onClose={() => setSessionDrawerOpen(false)}
        onNavigate={() => setSessionDrawerOpen(false)}
      />
      <main className="agent-conversation">
        <header className="agent-conversation__header">
          <IconButton
            icon={ArrowLeft}
            label="返回 AI 功能"
            onClick={() => navigate('/agent')}
          />
          <div className="agent-conversation__title">
            <h1>{session.data?.title}</h1>
            <StatusBadge tone={streamTone(streamState)}>
              {streamLabel(streamState)}
            </StatusBadge>
          </div>
          <div className="agent-conversation__actions">
            <IconButton
              icon={Plus}
              label="新建对话"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            />
            <IconButton
              icon={History}
              label="打开会话历史"
              aria-expanded={sessionDrawerOpen}
              onClick={() => setSessionDrawerOpen(true)}
            />
          </div>
        </header>
        <div className="agent-conversation__scroll">
          <AgentRunStatusView
            run={latestRun}
            childRuns={childRuns}
            cancelling={cancel.isPending}
            retrying={retry.isPending}
            onCancel={() => cancel.mutate()}
            onRetry={() => retry.mutate()}
          />
          <AgentRunPlan plan={latestRun?.plan ?? null} />
          <AgentEventTimeline
            messages={messages.data ?? []}
            events={timeline.events}
            onInspect={inspect}
            onUseMessage={addContext}
          />
          {latestRun?.waits.map((wait) => (
            <AgentWaitCondition
              key={wait.id}
              wait={wait}
              pending={respond.isPending}
              onRespond={(value) => respond.mutate({ wait, value })}
            />
          ))}
        </div>
        <AgentMessageComposer
          initialCapability={initialCapability}
          initialContent={initialContent}
          pending={send.isPending}
          error={send.error?.message ?? launchError ?? contextError}
          assets={assets.data ?? []}
          capabilities={capabilities.data ?? []}
          contextItems={contextItems}
          onAddContext={addContext}
          onRemoveContext={(key) =>
            setContextItems((current) => removeComposerContext(current, key))
          }
          onAssetUploaded={() =>
            void cache.invalidateQueries({
              queryKey: agentQueries.assets(userId).queryKey,
            })
          }
          onSubmit={(content, capability, execution) =>
            send.mutate({ content, capability, execution, contextItems })
          }
        />
      </main>
      <AgentInspector
        inspection={inspection}
        onClose={closeInspector}
        onUseArtifact={addContext}
      />
    </div>
  );
}

function requestedCapability(value: string | null): AgentCapabilitySelection {
  if (value === CapabilitySelection.AUTO) return CapabilitySelection.AUTO;
  return Object.values(CapabilityKey).includes(value as CapabilityKey)
    ? (value as CapabilityKey)
    : CapabilitySelection.AUTO;
}

function streamLabel(state: AgentStreamConnectionState): string {
  if (state === AgentStreamConnectionState.OPEN) return '实时';
  if (state === AgentStreamConnectionState.RECONNECTING) return '重连中';
  if (state === AgentStreamConnectionState.CLOSED) return '已断开';
  return '连接中';
}

function streamTone(
  state: AgentStreamConnectionState,
): 'positive' | 'warning' | 'neutral' {
  if (state === AgentStreamConnectionState.OPEN) return 'positive';
  if (state === AgentStreamConnectionState.RECONNECTING) return 'warning';
  return 'neutral';
}

function setCachedRun(
  cache: QueryClient,
  userId: string,
  sessionId: string,
  run: AgentRunView,
): void {
  cache.setQueryData<readonly AgentRunView[]>(
    agentQueries.runs(userId, sessionId).queryKey,
    (current = []) => [
      run,
      ...current.filter((candidate) => candidate.id !== run.id),
    ],
  );
}

function updateCachedRun(
  cache: QueryClient,
  userId: string,
  sessionId: string,
  event: AgentStreamEvent,
): void {
  cache.setQueryData<readonly AgentRunView[]>(
    agentQueries.runs(userId, sessionId).queryKey,
    (current = []) => reduceAgentRuns(current, event),
  );
}
