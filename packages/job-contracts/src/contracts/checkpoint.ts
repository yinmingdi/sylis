export interface JobCheckpointEnvelope<T = unknown> {
  jobId: string;
  sequence: number;
  handlerVersion: string;
  schemaVersion: string;
  inputHash: string;
  stateHash: string;
  state: T;
  createdAt: string;
}
