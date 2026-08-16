export enum JobEventType {
  STARTED = "job.started",
  PROGRESS = "job.progress",
  WARNING = "job.warning",
  COMPLETED = "job.completed",
  FAILED = "job.failed",
  CANCELLED = "job.cancelled",
}

export enum JobProgressEtaReliability {
  ESTIMATING = "ESTIMATING",
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum JobProgressErrorCode {
  REGRESSION = "JOB_PROGRESS_REGRESSION",
}

export enum JobTerminalProgressStage {
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  RETRY_SCHEDULED = "RETRY_SCHEDULED",
}

export const JOB_EVENT_TYPES = Object.values(JobEventType);

export interface JobProgressInput {
  type?: JobEventType;
  stage: string;
  processed: number;
  total: number | null;
  ratePerSecond?: number | null;
  etaSeconds?: number | null;
  etaReliability?: JobProgressEtaReliability | null;
  attemptId?: string | null;
  tokens?: number | null;
  costMicros?: number | null;
  warningCode?: string | null;
  message?: string | null;
}

export interface JobProgressEvent extends Omit<JobProgressInput, "type"> {
  jobId: string;
  sequence: number;
  type: JobEventType;
  occurredAt: string;
}
