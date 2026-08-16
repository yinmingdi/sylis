import {
  AgentRunStatus,
  JobProgressEtaReliability,
  type AgentRunProgressView,
  type AgentRunView,
} from '@sylis/api-client/agent';
import { Button, RefreshCw, StatusBadge, X } from '@sylis/components';

const toneByStatus = {
  [AgentRunStatus.QUEUED]: 'neutral',
  [AgentRunStatus.RUNNING]: 'info',
  [AgentRunStatus.WAITING]: 'warning',
  [AgentRunStatus.SUCCEEDED]: 'positive',
  [AgentRunStatus.FAILED]: 'danger',
  [AgentRunStatus.CANCELLED]: 'neutral',
} as const;

const labelByStatus = {
  [AgentRunStatus.QUEUED]: '排队中',
  [AgentRunStatus.RUNNING]: '执行中',
  [AgentRunStatus.WAITING]: '等待操作',
  [AgentRunStatus.SUCCEEDED]: '已完成',
  [AgentRunStatus.FAILED]: '失败',
  [AgentRunStatus.CANCELLED]: '已取消',
} as const;

export function AgentRunStatusView({
  run,
  childRuns,
  cancelling,
  retrying,
  onCancel,
  onRetry,
}: {
  run?: AgentRunView;
  childRuns: readonly AgentRunView[];
  cancelling: boolean;
  retrying: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (!run) return null;
  const active = [
    AgentRunStatus.QUEUED,
    AgentRunStatus.RUNNING,
    AgentRunStatus.WAITING,
  ].includes(run.status);
  return (
    <section className="agent-run-status">
      <div className="agent-run-status__header">
        <StatusBadge tone={toneByStatus[run.status]}>
          {labelByStatus[run.status]}
        </StatusBadge>
        {active ? (
          <Button
            icon={X}
            tone="quiet"
            disabled={cancelling}
            onClick={onCancel}
          >
            取消
          </Button>
        ) : run.status === AgentRunStatus.FAILED ? (
          <Button
            icon={RefreshCw}
            tone="quiet"
            disabled={retrying}
            onClick={onRetry}
          >
            重试
          </Button>
        ) : null}
      </div>
      {run.progress ? (
        <RunProgress progress={run.progress} label="主任务" />
      ) : null}
      {childRuns.map((child, index) =>
        child.progress ? (
          <RunProgress
            key={child.id}
            progress={child.progress}
            label={`子任务 ${index + 1}`}
          />
        ) : null,
      )}
    </section>
  );
}

function RunProgress({
  progress,
  label,
}: {
  progress: AgentRunProgressView;
  label: string;
}) {
  const hasTotal = progress.total !== null && progress.total > 0;
  const value = hasTotal
    ? Math.min(progress.processed, progress.total ?? progress.processed)
    : undefined;
  return (
    <div className="agent-run-progress">
      <div className="agent-run-progress__summary">
        <strong>{label}</strong>
        <span>{stageLabel(progress.stage)}</span>
        <span>
          {hasTotal
            ? `${progress.processed}/${progress.total}`
            : `${progress.processed} 步`}
        </span>
      </div>
      {hasTotal ? (
        <progress max={progress.total ?? 1} value={value} />
      ) : (
        <div className="agent-run-progress__indeterminate" aria-hidden="true" />
      )}
      <div className="agent-run-progress__facts">
        <span>{etaLabel(progress)}</span>
        {progress.ratePerSecond === null ? null : (
          <span>{progress.ratePerSecond.toFixed(1)}/秒</span>
        )}
        {progress.tokens === null ? null : (
          <span>{progress.tokens} tokens</span>
        )}
        {progress.costMicros === null || progress.currency === null ? null : (
          <span>{formatCost(progress.costMicros, progress.currency)}</span>
        )}
        <span>
          心跳 {formatTime(progress.heartbeatAt ?? progress.updatedAt)}
        </span>
      </div>
    </div>
  );
}

function stageLabel(stage: string): string {
  const labels: Readonly<Record<string, string>> = {
    STARTING: '正在启动',
    'message-delta': '正在生成回答',
    'tool-call-proposed': '正在调用工具',
    'proposal-submitted': '正在准备操作',
    'artifact-revision-proposed': '正在生成成果',
    'child-run-requested': '正在并行处理',
    'run-wait-requested': '等待输入',
    'run-completion-proposed': '正在收尾',
  };
  return labels[stage] ?? stage;
}

function etaLabel(progress: AgentRunProgressView): string {
  if (
    progress.etaSeconds === null ||
    progress.etaReliability === null ||
    progress.etaReliability === JobProgressEtaReliability.ESTIMATING
  ) {
    return '剩余时间估算中';
  }
  if (progress.etaSeconds < 60) return `约 ${progress.etaSeconds} 秒`;
  return `约 ${Math.ceil(progress.etaSeconds / 60)} 分钟`;
}

function formatCost(costMicros: string, currency: string): string {
  const value = Number(costMicros) / 1_000_000;
  if (!Number.isFinite(value)) return `${costMicros} μ${currency}`;
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 6,
    }).format(value);
  } catch {
    return `${value.toFixed(6)} ${currency}`;
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '未知'
    : date.toLocaleTimeString('zh-CN', { hour12: false });
}
