import { LexicalAnnotationTargetKind } from "@sylis/database";

export const LexicalTargetKind = {
  HEADWORD: LexicalAnnotationTargetKind.HEADWORD,
  ENTRY: LexicalAnnotationTargetKind.ENTRY,
  SENSE: LexicalAnnotationTargetKind.SENSE,
  COLLOCATION: LexicalAnnotationTargetKind.COLLOCATION,
} as const;

export type LexicalTargetKind =
  (typeof LexicalTargetKind)[keyof typeof LexicalTargetKind];
