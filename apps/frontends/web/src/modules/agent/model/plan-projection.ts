import {
  AgentPlanStepStatus,
  type AgentPlanView,
} from '@sylis/api-client/agent';

export interface AgentPlanStepProjection {
  id: string;
  title: string;
  status: AgentPlanStepStatus;
}

export function planProjection(
  plan: AgentPlanView | null,
): readonly AgentPlanStepProjection[] {
  return (plan?.currentRevision?.steps ?? []).map((step) => ({
    id: step.id,
    title: step.title,
    status: step.status,
  }));
}
