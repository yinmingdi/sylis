import { Button, ProgressBar, StatusBadge } from '@sylis/components';
import { useEffect, useRef, useState } from 'react';

import { jobsClient, subscribeToJob } from '../client';

interface ProgressState {
  stage: string;
  processed: number;
  total: number | null;
  state: string;
  message?: string;
}

export function JobProgress({
  jobId,
  onTerminal,
}: {
  jobId: string;
  onTerminal?: () => void;
}) {
  const [progress, setProgress] = useState<ProgressState>({
    stage: 'QUEUED',
    processed: 0,
    total: null,
    state: 'QUEUED',
  });
  const onTerminalRef = useRef(onTerminal);
  const terminalNotified = useRef(false);
  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);
  useEffect(() => {
    terminalNotified.current = false;
    setProgress({
      stage: 'QUEUED',
      processed: 0,
      total: null,
      state: 'QUEUED',
    });
    return subscribeToJob(jobId, (event) => {
      try {
        const payload = JSON.parse(event.data) as Partial<ProgressState> & {
          status?: string;
        };
        const state =
          payload.status ??
          (event.type === 'job.started'
            ? 'RUNNING'
            : event.type === 'job.completed'
              ? 'SUCCEEDED'
              : event.type === 'job.failed'
                ? 'FAILED'
                : event.type === 'job.cancelled'
                  ? 'CANCELLED'
                  : payload.stage === 'RETRY_SCHEDULED'
                    ? 'RETRY_SCHEDULED'
                    : undefined);
        setProgress((current) => ({
          ...current,
          ...payload,
          state: state ?? current.state,
        }));
        if (
          state &&
          !terminalNotified.current &&
          ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(state)
        ) {
          terminalNotified.current = true;
          onTerminalRef.current?.();
        }
      } catch {
        // Ignore heartbeat frames without JSON payload.
      }
    });
  }, [jobId]);
  const percent = progress.total
    ? (progress.processed / progress.total) * 100
    : progress.state === 'SUCCEEDED'
      ? 100
      : 8;
  return (
    <div className="job-progress">
      <div>
        <StatusBadge
          tone={
            progress.state === 'FAILED'
              ? 'danger'
              : progress.state === 'SUCCEEDED'
                ? 'positive'
                : 'info'
          }
        >
          {progress.state}
        </StatusBadge>
        <strong>{progress.stage}</strong>
      </div>
      <ProgressBar value={percent} label="任务进度" />
      {progress.message ? <p>{progress.message}</p> : null}
      {!['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(progress.state) ? (
        <Button tone="quiet" onClick={() => jobsClient.cancel(jobId)}>
          取消
        </Button>
      ) : null}
    </div>
  );
}
