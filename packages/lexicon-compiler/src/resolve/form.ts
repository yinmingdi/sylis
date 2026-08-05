import type {
  FormResolutionStatus,
  NormalizedSourceRecord,
} from "../candidates/candidate-v1";

export function resolveFormStatus(
  records: Pick<
    NormalizedSourceRecord,
    "formOfEvidence" | "independentEntryEvidence"
  >[],
): FormResolutionStatus {
  const hasFormOf = records.some((record) => record.formOfEvidence.length > 0);
  const hasIndependentEntry = records.some(
    (record) => record.independentEntryEvidence,
  );
  if (hasFormOf && hasIndependentEntry) return "BOTH";
  if (hasFormOf) return "INFLECTED_ONLY";
  if (hasIndependentEntry) return "INDEPENDENT_ONLY";
  return "UNRESOLVED";
}
