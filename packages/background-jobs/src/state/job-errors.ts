const TRANSIENT_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "P1001",
  "P1002",
  "P1008",
  "P1017",
]);

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
