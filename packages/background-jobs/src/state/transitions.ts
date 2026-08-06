import type { JobStatus } from "./job-state";
import { isTerminalJobStatus } from "./job-state";

const TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["RETRY_SCHEDULED", "PAUSED", "SUCCEEDED", "FAILED", "CANCELLED"],
  RETRY_SCHEDULED: ["RUNNING", "CANCELLED"],
  PAUSED: ["QUEUED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export const allowedJobTransitions = (
  status: JobStatus,
): readonly JobStatus[] => TRANSITIONS[status];

export const canTransitionJob = (from: JobStatus, to: JobStatus): boolean =>
  TRANSITIONS[from].includes(to);

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (isTerminalJobStatus(from) || !canTransitionJob(from, to)) {
    throw new Error(`INVALID_JOB_TRANSITION:${from}:${to}`);
  }
}
