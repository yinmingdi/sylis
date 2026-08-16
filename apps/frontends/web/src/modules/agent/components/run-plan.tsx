import {
  AgentPlanStepStatus,
  type AgentPlanView,
} from '@sylis/api-client/agent';
import { Check, Clock, ListChecks, X } from '@sylis/components';

import { planProjection } from '../model/plan-projection';

const iconByStatus = {
  [AgentPlanStepStatus.PENDING]: Clock,
  [AgentPlanStepStatus.RUNNING]: Clock,
  [AgentPlanStepStatus.SUCCEEDED]: Check,
  [AgentPlanStepStatus.FAILED]: X,
  [AgentPlanStepStatus.SKIPPED]: X,
} as const;

export function AgentRunPlan({ plan }: { plan: AgentPlanView | null }) {
  const steps = planProjection(plan);
  if (steps.length === 0) return null;
  return (
    <section className="agent-run-plan" aria-label="执行计划">
      <div>
        <ListChecks aria-hidden="true" size={16} />
        <strong>执行计划</strong>
      </div>
      <ol>
        {steps.map((step) => {
          const Icon = iconByStatus[step.status];
          return (
            <li key={step.id} data-status={step.status}>
              <Icon aria-hidden="true" size={15} />
              <span>{step.title}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
