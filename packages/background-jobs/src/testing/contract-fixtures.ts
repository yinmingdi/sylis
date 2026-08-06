import type { JobProgressInput } from "../contracts/progress";
import type { JobKind } from "../kinds/job-kind";
import { JOB_KIND_REGISTRY } from "../kinds/registry";

export const validProgressFixture = (): JobProgressInput => ({
  type: "job.progress",
  stage: "RUNNING",
  processed: 1,
  total: 2,
  ratePerSecond: 1,
  etaSeconds: 1,
});

export const registeredJobKinds = (): readonly JobKind[] =>
  Object.keys(JOB_KIND_REGISTRY) as JobKind[];
