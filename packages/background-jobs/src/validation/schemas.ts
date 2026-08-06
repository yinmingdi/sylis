export const JOB_CONTRACT_SCHEMA_VERSION = "sylis.background-jobs/1" as const;

export const JOB_CONTRACT_LIMITS = {
  maxStageLength: 96,
  maxMessageLength: 512,
  maxCheckpointBytes: 1_048_576,
} as const;
