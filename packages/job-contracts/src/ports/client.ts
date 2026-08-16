import type { JobInputReference } from "../contracts/payloads";
import type { JobProgressEvent } from "../contracts/progress";
import type { JobStatus } from "../state/job-state";

export enum JobAudience {
  USER = "USER",
  ADMIN = "ADMIN",
  SYSTEM = "SYSTEM",
}

export interface EnqueueJobCommand {
  input: JobInputReference;
  requestedByUserId?: string;
  subjectUserId?: string;
  audience: JobAudience;
  idempotencyKey: string;
  priority?: number;
}

export interface JobProjection {
  id: string;
  kind: JobInputReference["kind"];
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  cancelRequestedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface JobClient {
  enqueue(command: EnqueueJobCommand): Promise<JobProjection>;
  get(jobId: string): Promise<JobProjection | null>;
  cancel(jobId: string): Promise<JobProjection>;
  events(
    jobId: string,
    afterSequence?: number,
  ): AsyncIterable<JobProgressEvent>;
}
