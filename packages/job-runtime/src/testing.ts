import {
  JobCancellationErrorCode,
  JobProgressErrorCode,
  JobStatus,
  type JobKind,
  type JobProgressInput,
  type JobResultRef,
} from "@sylis/job-contracts";

import {
  JobFailureClass,
  type ClaimedAttempt,
  type JobFailure,
  type JobStore,
} from "./index";

interface MemoryJob {
  jobId: string;
  kind: JobKind;
  inputRef: Readonly<Record<string, unknown>>;
  inputHash: string;
  handlerVersion: string;
  checkpointSchemaVersion: string;
  attemptNumber: number;
  fencingToken: bigint;
  status: JobStatus;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  cancellationRequested: boolean;
  checkpoint: Readonly<Record<string, unknown>> | null;
  progress: JobProgressInput[];
  result: JobResultRef | null;
  failure: JobFailure | null;
}

export class MemoryJobStore implements JobStore {
  readonly jobs = new Map<string, MemoryJob>();

  requestCancellation(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("JOB_NOT_FOUND");
    job.cancellationRequested = true;
  }

  enqueue(
    job: Omit<
      MemoryJob,
      | "attemptNumber"
      | "fencingToken"
      | "status"
      | "leaseToken"
      | "leaseExpiresAt"
      | "cancellationRequested"
      | "checkpoint"
      | "progress"
      | "result"
      | "failure"
    >,
  ): void {
    this.jobs.set(job.jobId, {
      ...job,
      attemptNumber: 0,
      fencingToken: 0n,
      status: JobStatus.QUEUED,
      leaseToken: null,
      leaseExpiresAt: null,
      cancellationRequested: false,
      checkpoint: null,
      progress: [],
      result: null,
      failure: null,
    });
  }

  async claim(
    input: Parameters<JobStore["claim"]>[0],
  ): Promise<ClaimedAttempt | null> {
    const job = [...this.jobs.values()].find(
      (candidate) =>
        input.kinds.includes(candidate.kind) &&
        (candidate.status === JobStatus.QUEUED ||
          (candidate.status === JobStatus.RUNNING &&
            candidate.leaseExpiresAt !== null &&
            candidate.leaseExpiresAt <= input.now)),
    );
    if (!job) return null;
    job.status = JobStatus.RUNNING;
    job.attemptNumber += 1;
    job.fencingToken += 1n;
    job.leaseToken = input.leaseToken;
    job.leaseExpiresAt = input.leaseExpiresAt;
    return this.claimed(job);
  }

  async heartbeat(
    attempt: ClaimedAttempt,
    _now: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    const job = this.active(attempt);
    if (!job) return false;
    job.leaseExpiresAt = expiresAt;
    return true;
  }

  async checkpoint(
    attempt: ClaimedAttempt,
    value: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    const job = this.active(attempt);
    if (!job) return false;
    job.checkpoint = value;
    return true;
  }

  async progress(
    attempt: ClaimedAttempt,
    event: JobProgressInput,
  ): Promise<boolean> {
    const job = this.active(attempt);
    if (!job) return false;
    const previous = job.progress.findLast(
      (candidate) => candidate.stage === event.stage,
    );
    if (previous && event.processed < previous.processed) {
      throw new Error(JobProgressErrorCode.REGRESSION);
    }
    job.progress.push(event);
    return true;
  }

  async cancellationRequested(
    attempt: ClaimedAttempt,
  ): Promise<boolean | null> {
    return this.active(attempt)?.cancellationRequested ?? null;
  }

  async finish(
    attempt: ClaimedAttempt,
    result: JobResultRef,
  ): Promise<boolean> {
    const job = this.active(attempt);
    if (!job) return false;
    if (job.cancellationRequested) {
      job.status = JobStatus.CANCELLED;
      job.failure = {
        failureClass: JobFailureClass.CANCELLED,
        errorCode: JobCancellationErrorCode.REQUESTED,
      };
    } else {
      job.status = JobStatus.SUCCEEDED;
      job.result = result;
    }
    job.leaseToken = null;
    return true;
  }

  async fail(attempt: ClaimedAttempt, failure: JobFailure): Promise<boolean> {
    const job = this.active(attempt);
    if (!job) return false;
    if (job.cancellationRequested) {
      job.status = JobStatus.CANCELLED;
      job.failure = {
        failureClass: JobFailureClass.CANCELLED,
        errorCode: JobCancellationErrorCode.REQUESTED,
      };
    } else {
      job.status = JobStatus.FAILED;
      job.failure = failure;
    }
    job.leaseToken = null;
    return true;
  }

  private active(attempt: ClaimedAttempt): MemoryJob | null {
    const job = this.jobs.get(attempt.jobId);
    if (
      !job ||
      job.status !== JobStatus.RUNNING ||
      job.leaseToken !== attempt.leaseToken ||
      job.fencingToken !== attempt.fencingToken
    ) {
      return null;
    }
    return job;
  }

  private claimed(job: MemoryJob): ClaimedAttempt {
    return {
      jobId: job.jobId,
      attemptId: `${job.jobId}:${job.attemptNumber}`,
      attemptNumber: job.attemptNumber,
      kind: job.kind,
      inputRef: job.inputRef,
      inputHash: job.inputHash,
      handlerVersion: job.handlerVersion,
      checkpointSchemaVersion: job.checkpointSchemaVersion,
      fencingToken: job.fencingToken,
      leaseToken: job.leaseToken!,
      leaseExpiresAt: job.leaseExpiresAt!,
      checkpoint: null,
    };
  }
}
