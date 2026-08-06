import type { JobKind } from "../kinds/job-kind";

export interface JobAvailableEvent {
  eventVersion: "sylis.job-available/1";
  eventId: string;
  jobId: string;
  kind: JobKind;
  occurredAt: string;
}
