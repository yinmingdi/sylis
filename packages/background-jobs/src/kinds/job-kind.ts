export const JOB_KINDS = [
  "TUTOR_RESPONSE",
  "READING_GENERATION",
  "GRAMMAR_DIAGNOSIS",
  "DATA_EXPORT",
  "DAILY_PLAN",
  "SOURCE_SYNC",
  "LEXICON_BUILD",
  "LEXICON_IMPORT",
  "LEXICON_VALIDATE",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export const isJobKind = (value: unknown): value is JobKind =>
  typeof value === "string" && JOB_KINDS.includes(value as JobKind);
