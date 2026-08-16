import {
  ExerciseDiacriticPolicy,
  ExerciseWhitespacePolicy,
} from "@sylis/database";

export interface ShortTextNormalizationConfig {
  caseSensitive: boolean;
  diacriticPolicy: ExerciseDiacriticPolicy;
  whitespacePolicy: ExerciseWhitespacePolicy;
}

export function normalizeShortText(
  value: string,
  config: ShortTextNormalizationConfig,
): string {
  let normalized = value.normalize("NFC");
  switch (config.whitespacePolicy) {
    case ExerciseWhitespacePolicy.PRESERVE:
      break;
    case ExerciseWhitespacePolicy.TRIM:
      normalized = normalized.trim();
      break;
    case ExerciseWhitespacePolicy.COLLAPSE:
      normalized = normalized.trim().replace(/\s+/gu, " ");
      break;
  }
  if (config.diacriticPolicy === ExerciseDiacriticPolicy.IGNORE) {
    normalized = normalized
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .normalize("NFC");
  }
  return config.caseSensitive
    ? normalized
    : normalized.toLocaleLowerCase("en-US");
}
