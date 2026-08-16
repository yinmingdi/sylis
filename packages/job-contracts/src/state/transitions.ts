import { isTerminalJobStatus, JobStatus } from "./job-state";

const TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  QUEUED: [JobStatus.RUNNING, JobStatus.CANCELLED],
  RUNNING: [
    JobStatus.RETRY_SCHEDULED,
    JobStatus.SUCCEEDED,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
  ],
  RETRY_SCHEDULED: [JobStatus.RUNNING, JobStatus.CANCELLED],
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
