import type { JobKind } from "@sylis/background-jobs";

import type { ClaimedWorkerJob } from "./job-runtime.service";

export interface WorkerHandler {
  readonly kind: JobKind;
  run(job: ClaimedWorkerJob): Promise<void>;
}
