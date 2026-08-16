import {
  FormResolutionStatus,
  type NormalizedSourceRecord,
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
  if (hasFormOf && hasIndependentEntry) return FormResolutionStatus.BOTH;
  if (hasFormOf) return FormResolutionStatus.INFLECTED_ONLY;
  if (hasIndependentEntry) return FormResolutionStatus.INDEPENDENT_ONLY;
  return FormResolutionStatus.UNRESOLVED;
}
