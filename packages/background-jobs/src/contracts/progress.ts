export const JOB_EVENT_TYPES = [
  "job.started",
  "job.progress",
  "job.warning",
  "job.paused",
  "job.completed",
  "job.failed",
  "job.cancelled",
] as const;

export type JobEventType = (typeof JOB_EVENT_TYPES)[number];

export interface JobProgressInput {
  type?: JobEventType;
  stage: string;
  processed: number;
  total: number | null;
  ratePerSecond?: number | null;
  etaSeconds?: number | null;
  warningCode?: string | null;
  message?: string | null;
}

export interface JobProgressEvent extends JobProgressInput {
  jobId: string;
  sequence: number;
  occurredAt: string;
}
