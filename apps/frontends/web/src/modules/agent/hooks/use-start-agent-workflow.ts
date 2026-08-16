import type { AgentSessionView } from '@sylis/api-client/agent';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useCurrentUserId } from '../../identity';
import { agentCommands } from '../api/commands';
import { agentQueries } from '../api/queries';
import {
  agentLearningWorkflowPreset,
  agentWorkflowNavigationState,
  type AgentLearningWorkflow,
} from '../model/learning-workflow';

export interface StartAgentWorkflowInput {
  title: string;
  workflow: AgentLearningWorkflow;
  instruction?: string;
}

export function useStartAgentWorkflow() {
  const userId = useCurrentUserId();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return useMutation({
    mutationFn: (input: StartAgentWorkflowInput) =>
      agentCommands.sessions.create(input.title),
    onSuccess: async (session: AgentSessionView, input) => {
      await cache.invalidateQueries({
        queryKey: agentQueries.sessions(userId).queryKey,
      });
      const target = new URLSearchParams(searchParams);
      target.set(
        'capability',
        agentLearningWorkflowPreset(input.workflow).capability,
      );
      target.set('workflow', input.workflow);
      navigate(`/agent/sessions/${session.id}?${target.toString()}`, {
        state: input.instruction
          ? agentWorkflowNavigationState(input.workflow, input.instruction)
          : undefined,
      });
    },
  });
}
