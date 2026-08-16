export enum JobStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  RETRY_SCHEDULED = "RETRY_SCHEDULED",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export const JOB_STATUSES = Object.values(JobStatus);

export const TERMINAL_JOB_STATUSES = [
  JobStatus.SUCCEEDED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
] as const satisfies readonly JobStatus[];

export type TerminalJobStatus = (typeof TERMINAL_JOB_STATUSES)[number];

export const isTerminalJobStatus = (
  status: JobStatus,
): status is TerminalJobStatus =>
  TERMINAL_JOB_STATUSES.includes(status as TerminalJobStatus);
