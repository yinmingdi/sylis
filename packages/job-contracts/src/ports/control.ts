import type { JobProgressInput } from "../contracts/progress";

export interface JobControl<Checkpoint> {
  readonly jobId: string;
  readonly attempt: number;
  readonly checkpoint: Checkpoint | null;
  readonly signal: AbortSignal;
  heartbeat(): Promise<void>;
  report(event: JobProgressInput): Promise<void>;
  checkpointAt(value: Checkpoint): Promise<void>;
  isCancellationRequested(): Promise<boolean>;
}
