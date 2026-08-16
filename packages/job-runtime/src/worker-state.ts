export enum JobWorkerStatus {
  STARTING = "STARTING",
  IDLE = "IDLE",
  RECOVERING = "RECOVERING",
  RUNNING = "RUNNING",
  DRAINING = "DRAINING",
  STOPPED = "STOPPED",
}

export interface JobWorkerState {
  status: JobWorkerStatus;
  jobId: string | null;
  attemptId: string | null;
  updatedAt: string;
}
