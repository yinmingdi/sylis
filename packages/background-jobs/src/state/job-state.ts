export const JOB_STATUSES = [
  "QUEUED",
  "RUNNING",
  "RETRY_SCHEDULED",
  "PAUSED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const TERMINAL_JOB_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly JobStatus[];

export type TerminalJobStatus = (typeof TERMINAL_JOB_STATUSES)[number];

export const PAUSE_REASON_CODES = [
  "BUDGET_APPROVAL_REQUIRED",
  "CONTENT_REVIEW_REQUIRED",
  "SOURCE_RIGHTS_BLOCKED",
  "HANDLER_UPGRADE_REQUIRED",
  "OPERATOR_PAUSED",
] as const;

export type PauseReasonCode = (typeof PAUSE_REASON_CODES)[number];

export const isTerminalJobStatus = (
  status: JobStatus,
): status is TerminalJobStatus =>
  TERMINAL_JOB_STATUSES.includes(status as TerminalJobStatus);
