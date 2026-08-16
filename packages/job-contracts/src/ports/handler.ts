import type { JobControl } from "./control";
import type { JobResultRef } from "../contracts/results";
import type { JobKind } from "../kinds/job-kind";

export interface JobHandler<Context, Checkpoint> {
  readonly kind: JobKind;
  run(context: Context, control: JobControl<Checkpoint>): Promise<JobResultRef>;
}
