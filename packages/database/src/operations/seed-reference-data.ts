import type {
  JobOperatorRoleMatch as JobOperatorRoleMatchValue,
  OperatorRole as OperatorRoleValue,
} from "@prisma/client";
import {
  JOB_KIND_REGISTRY,
  JobCancellationPolicy,
  JobRetryPolicy,
  JobSideEffectPolicy,
} from "@sylis/job-contracts";
import { createHash } from "node:crypto";

import {
  ExecutorKind,
  JobFailureClass,
  JobKind,
  JobOperatorRoleMatch,
  JobReconciliationRule,
  JobStatus,
  OperatorRole,
} from "../client/prisma-client";
import type { SylisDatabase } from "../client/prisma-client";

export const JobPolicyVersion = "job-policy/v0.0.1";

const EFFECTIVE_AT = new Date("2026-01-01T00:00:00.000Z");

const OPERATOR_CONTROL = {
  AGENT_RUN_ACTIVATION: control([OperatorRole.SUPPORT]),
  AGENT_TOOL_CONTINUATION: control([OperatorRole.SUPPORT]),
  AGENT_RELEASE_EVALUATION: control([OperatorRole.AGENT_RELEASE_MANAGER]),
  AGENT_RELEASE_JUDGEMENT: control([OperatorRole.AGENT_RELEASE_MANAGER]),
  ASSET_SCAN: control([OperatorRole.SUPPORT]),
  ASSET_EXTRACT: control([OperatorRole.SUPPORT]),
  ASSET_OCR: control([OperatorRole.SUPPORT]),
  ASSET_LEXICAL_INDEX: control([OperatorRole.SUPPORT]),
  ASSET_EMBEDDING: control([OperatorRole.SUPPORT]),
  ASSET_IMAGE_ANALYSIS: control([OperatorRole.SUPPORT]),
  AUDIT_ARCHIVE: control([OperatorRole.SECURITY_ADMIN]),
  AUDIT_ARCHIVE_PURGE: control([OperatorRole.SECURITY_ADMIN]),
  DATA_EXPORT: control([OperatorRole.SUPPORT]),
  AUDIT_EXPORT: control([OperatorRole.SECURITY_ADMIN]),
  SOURCE_SYNC: control([OperatorRole.LEXICON_OPERATOR]),
  RETENTION_PURGE: control([OperatorRole.SECURITY_ADMIN]),
  LEXICON_BUILD: control([OperatorRole.LEXICON_OPERATOR]),
  LEXICON_PUBLISH: control(
    [OperatorRole.LEXICON_OPERATOR, OperatorRole.RELEASE_MANAGER],
    JobOperatorRoleMatch.ALL,
  ),
  LEXICON_VALIDATE: control(
    [OperatorRole.LEXICON_OPERATOR, OperatorRole.CONTENT_REVIEWER],
    JobOperatorRoleMatch.ALL,
  ),
} as const satisfies Record<
  keyof typeof JOB_KIND_REGISTRY,
  ReturnType<typeof control>
>;

export async function seedReferenceData(
  database: SylisDatabase,
): Promise<void> {
  await database.jobKindPolicy.createMany({
    data: Object.values(JOB_KIND_REGISTRY).map((definition) => {
      const jobKind = JobKind[definition.kind as keyof typeof JobKind];
      const executor =
        ExecutorKind[definition.executor as keyof typeof ExecutorKind];
      const operatorControl =
        OPERATOR_CONTROL[definition.kind as keyof typeof OPERATOR_CONTROL];
      const cancellable =
        definition.cancellationPolicy === JobCancellationPolicy.COOPERATIVE;
      const retryable = definition.retryPolicy !== JobRetryPolicy.NEVER;

      return {
        id: deterministicId(`${JobPolicyVersion}:${jobKind}`),
        jobKind,
        executor,
        policyVersion: JobPolicyVersion,
        cancellable,
        cancelAllowedStatuses: cancellable
          ? [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.RETRY_SCHEDULED]
          : [],
        retryAllowedStatuses: retryable ? [JobStatus.FAILED] : [],
        retryableFailureClasses: retryable
          ? [JobFailureClass.TRANSIENT, JobFailureClass.PERMANENT]
          : [],
        resumableStates: [],
        reconciliationRule:
          definition.sideEffectPolicy ===
          JobSideEffectPolicy.RECONCILIATION_REQUIRED
            ? JobReconciliationRule.REQUIRED_ON_UNKNOWN_OUTCOME
            : JobReconciliationRule.NOT_REQUIRED,
        requiredOperatorRoles: [...operatorControl.roles],
        operatorRoleMatch: operatorControl.match,
        maxAttempts: definition.maxAttempts,
        timeoutMs: BigInt(definition.timeoutMs),
        effectiveAt: EFFECTIVE_AT,
      };
    }),
  });
}

function control(
  roles: readonly OperatorRoleValue[],
  match: JobOperatorRoleMatchValue = JobOperatorRoleMatch.ANY,
) {
  return { roles, match } as const;
}

function deterministicId(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
