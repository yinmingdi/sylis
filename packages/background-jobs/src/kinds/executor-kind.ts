export const EXECUTOR_KINDS = [
  "WORKER",
  "COMPILER_RUNNER",
  "IMPORTER_RUNNER",
] as const;

export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];
