enum TransientSystemErrorCode {
  CONNECTION_ABORTED = "ECONNABORTED",
  CONNECTION_REFUSED = "ECONNREFUSED",
  CONNECTION_RESET = "ECONNRESET",
  DNS_LOOKUP_AGAIN = "EAI_AGAIN",
  DNS_NOT_FOUND = "ENOTFOUND",
  HOST_UNREACHABLE = "EHOSTUNREACH",
  NETWORK_UNREACHABLE = "ENETUNREACH",
  PIPE_CLOSED = "EPIPE",
  PRISMA_CONNECTION = "P1001",
  PRISMA_CONNECTION_TIMEOUT = "P1002",
  PRISMA_OPERATION_TIMEOUT = "P1008",
  PRISMA_CONNECTION_CLOSED = "P1017",
  TIMED_OUT = "ETIMEDOUT",
}

const TRANSIENT_ERROR_CODES = new Set<string>(
  Object.values(TransientSystemErrorCode),
);

export enum JobCancellationErrorCode {
  REQUESTED = "JOB_CANCELLED",
  WORKER_SHUTDOWN = "WORKER_SHUTDOWN",
}

export enum JobRuntimeErrorCode {
  LEASE_EXPIRED = "JOB_LEASE_EXPIRED",
  LEASE_LOST = "JOB_LEASE_LOST",
  RECONCILIATION_REQUIRED = "JOB_RECONCILIATION_REQUIRED",
}

export class RetryableJobError extends Error {
  readonly retryable = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableJobError";
  }
}

export function isRetryableJobError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (
    "retryable" in error &&
    (error as Error & { retryable: unknown }).retryable === true
  ) {
    return true;
  }
  if (
    "$retryable" in error &&
    Boolean((error as Error & { $retryable: unknown }).$retryable)
  ) {
    return true;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code !== undefined && TRANSIENT_ERROR_CODES.has(code);
}
