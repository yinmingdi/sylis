import {
  AgentProposalDecision,
  AgentProposalRiskClass,
  AgentProposalStatus,
} from '@sylis/api-client/agent';
import {
  Button,
  Check,
  IconButton,
  ShieldCheck,
  StatusBadge,
  X,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCurrentUserId } from '../../identity';
import { agentCommands } from '../api/commands';
import { agentQueries } from '../api/queries';

const riskTone = {
  [AgentProposalRiskClass.LOW]: 'neutral',
  [AgentProposalRiskClass.MEDIUM]: 'warning',
  [AgentProposalRiskClass.HIGH]: 'danger',
  [AgentProposalRiskClass.PROHIBITED]: 'danger',
} as const;

export function AgentProposalReview({
  proposalId,
  onClose,
}: {
  proposalId: string;
  onClose: () => void;
}) {
  const userId = useCurrentUserId();
  const query = useQuery(agentQueries.proposal(userId, proposalId));
  const cache = useQueryClient();
  const decision = useMutation({
    mutationFn: (value: AgentProposalDecision) => {
      if (!query.data) throw new Error('批准内容尚未载入');
      return agentCommands.proposals.decide(
        proposalId,
        value,
        query.data.actionDigest,
      );
    },
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: agentQueries.proposal(userId, proposalId).queryKey,
      });
    },
  });
  const proposal = query.data;
  const actionable =
    proposal?.status === AgentProposalStatus.PENDING &&
    proposal.riskClass !== AgentProposalRiskClass.PROHIBITED;
  return (
    <section className="agent-inspector__content" aria-label="操作批准">
      <header>
        <div>
          <span>操作批准</span>
          <h2>{proposal?.commandType ?? '载入中'}</h2>
        </div>
        <IconButton icon={X} label="关闭检查器" onClick={onClose} />
      </header>
      {query.error ? <p className="form-error">{query.error.message}</p> : null}
      {proposal ? (
        <>
          <div className="agent-proposal__badges">
            <StatusBadge tone={riskTone[proposal.riskClass]}>
              {proposal.riskClass}
            </StatusBadge>
            <StatusBadge>{proposal.status}</StatusBadge>
          </div>
          <dl className="agent-inspector__facts">
            <div>
              <dt>目标</dt>
              <dd>{targetLabel(proposal.targetRef)}</dd>
            </div>
            <div>
              <dt>影响</dt>
              <dd>写入你的私人学习数据</dd>
            </div>
            <div>
              <dt>可撤销</dt>
              <dd>是</dd>
            </div>
            <div>
              <dt>有效期</dt>
              <dd>{new Date(proposal.expiresAt).toLocaleString('zh-CN')}</dd>
            </div>
            <div>
              <dt>动作摘要</dt>
              <dd className="agent-digest">{proposal.actionDigest}</dd>
            </div>
          </dl>
          {actionable ? (
            <div className="agent-inspector__actions">
              <Button
                icon={X}
                tone="secondary"
                disabled={decision.isPending}
                onClick={() => decision.mutate(AgentProposalDecision.REJECT)}
              >
                拒绝
              </Button>
              <Button
                icon={ShieldCheck}
                disabled={decision.isPending}
                onClick={() => decision.mutate(AgentProposalDecision.APPROVE)}
              >
                批准
              </Button>
            </div>
          ) : proposal.status === AgentProposalStatus.COMMITTED ? (
            <p className="agent-inspector__notice">
              <Check aria-hidden="true" size={16} /> 操作已经提交
            </p>
          ) : proposal.status === AgentProposalStatus.COMMITTING ? (
            <p className="agent-inspector__notice">正在提交已批准的操作</p>
          ) : null}
          {decision.error ? (
            <p className="form-error">{decision.error.message}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function targetLabel(target: Readonly<Record<string, unknown>>): string {
  const kind = typeof target.kind === 'string' ? target.kind : '资源';
  const id = typeof target.id === 'string' ? target.id : '';
  return id ? `${kind} · ${id}` : kind;
}
