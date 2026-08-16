import {
  ArrowRight,
  BookOpen,
  Bot,
  FileText,
  History,
  IconButton,
  Library,
  SquarePen,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  AgentLearningWorkflow,
  AgentSessionDrawer,
  AgentWorkflowLauncher,
  agentCommands,
  agentQueries,
  agentReadingWorkflowInstruction,
  useStartAgentWorkflow,
  type AgentReadingWorkflowConfiguration,
} from '../../modules/agent';
import { useCurrentUserId } from '../../modules/identity';

enum AgentFeatureActionKind {
  START_WORKFLOW = 'START_WORKFLOW',
  OPEN_GENERATOR = 'OPEN_GENERATOR',
  NAVIGATE = 'NAVIGATE',
}

interface AgentFeature {
  id: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
  action:
    | {
        kind: AgentFeatureActionKind.START_WORKFLOW;
        workflow: AgentLearningWorkflow;
      }
    | {
        kind: AgentFeatureActionKind.OPEN_GENERATOR;
        workflow:
          | AgentLearningWorkflow.STORY_READING
          | AgentLearningWorkflow.CLOZE_READING;
      }
    | { kind: AgentFeatureActionKind.NAVIGATE; to: string };
}

const features: readonly AgentFeature[] = [
  {
    id: 'story-reading',
    title: '故事阅读',
    description: '在生动故事中自然记忆单词',
    icon: BookOpen,
    action: {
      kind: AgentFeatureActionKind.OPEN_GENERATOR,
      workflow: AgentLearningWorkflow.STORY_READING,
    },
  },
  {
    id: 'cloze-reading',
    title: '填空阅读',
    description: '在语境中提升理解能力',
    icon: SquarePen,
    action: {
      kind: AgentFeatureActionKind.OPEN_GENERATOR,
      workflow: AgentLearningWorkflow.CLOZE_READING,
    },
  },
  {
    id: 'grammar-analysis',
    title: '语法解析',
    description: '智能分析英语句子语法结构',
    icon: FileText,
    action: { kind: AgentFeatureActionKind.NAVIGATE, to: '/agent/grammar' },
  },
  {
    id: 'learning-chat',
    title: 'AI 对话',
    description: '与 AI 自然对话练习英语',
    icon: Bot,
    action: {
      kind: AgentFeatureActionKind.START_WORKFLOW,
      workflow: AgentLearningWorkflow.LEARNING_CHAT,
    },
  },
  {
    id: 'articles',
    title: '我的文章',
    description: '查看和管理生成的文章',
    icon: Library,
    action: { kind: AgentFeatureActionKind.NAVIGATE, to: '/agent/articles' },
  },
] as const;

export function AgentPage() {
  const userId = useCurrentUserId();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const sessions = useQuery(agentQueries.sessions(userId));
  const start = useStartAgentWorkflow();
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [generatorWorkflow, setGeneratorWorkflow] = useState<
    | AgentLearningWorkflow.STORY_READING
    | AgentLearningWorkflow.CLOZE_READING
    | null
  >(null);
  const create = useMutation({
    mutationFn: () => agentCommands.sessions.create('新会话'),
    onSuccess: async (session) => {
      setSessionDrawerOpen(false);
      await cache.invalidateQueries({
        queryKey: agentQueries.sessions(userId).queryKey,
      });
      navigate(`/agent/sessions/${session.id}`);
    },
  });

  const activate = (feature: AgentFeature) => {
    if (feature.action.kind === AgentFeatureActionKind.NAVIGATE) {
      navigate(feature.action.to);
      return;
    }
    if (feature.action.kind === AgentFeatureActionKind.OPEN_GENERATOR) {
      setGeneratorWorkflow(feature.action.workflow);
      return;
    }
    start.mutate({
      title: feature.title,
      workflow: feature.action.workflow,
    });
  };

  const generate = (configuration: AgentReadingWorkflowConfiguration) => {
    if (!generatorWorkflow) return;
    start.mutate({
      title:
        generatorWorkflow === AgentLearningWorkflow.STORY_READING
          ? '故事阅读'
          : '填空阅读',
      workflow: generatorWorkflow,
      instruction: agentReadingWorkflowInstruction(
        generatorWorkflow,
        configuration,
      ),
    });
  };

  return (
    <div className="agent-feature-shell">
      <AgentSessionDrawer
        open={sessionDrawerOpen}
        sessions={sessions.data ?? []}
        creating={create.isPending}
        onCreate={() => create.mutate()}
        onClose={() => setSessionDrawerOpen(false)}
        onNavigate={() => setSessionDrawerOpen(false)}
      />
      <main className="agent-feature-home page">
        <header className="agent-feature-home__hero">
          <IconButton
            icon={History}
            label="打开会话历史"
            aria-expanded={sessionDrawerOpen}
            onClick={() => setSessionDrawerOpen(true)}
          />
          <h1>智能学习，事半功倍</h1>
          <p>AI 技术为您量身定制学习方案</p>
        </header>
        <div className="agent-feature-list">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.id}
                type="button"
                aria-label={feature.title}
                disabled={
                  start.isPending &&
                  feature.action.kind === AgentFeatureActionKind.START_WORKFLOW
                }
                onClick={() => activate(feature)}
              >
                <span className={`agent-feature-list__icon ${feature.id}`}>
                  <Icon aria-hidden="true" size={23} strokeWidth={1.8} />
                </span>
                <span className="agent-feature-list__copy">
                  <strong>{feature.title}</strong>
                  <small>{feature.description}</small>
                </span>
                <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
        <div aria-live="polite">
          {start.error && !generatorWorkflow ? (
            <p className="form-error">{start.error.message}</p>
          ) : null}
        </div>
        <AgentWorkflowLauncher
          workflow={generatorWorkflow}
          pending={start.isPending}
          error={start.error?.message}
          onClose={() => setGeneratorWorkflow(null)}
          onSubmit={generate}
        />
      </main>
    </div>
  );
}
