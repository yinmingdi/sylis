import {
  CandidateRiskClass as DatabaseCandidateRiskClass,
  CandidateStatus,
  CandidateTaskType,
  ContentEvidenceKind,
  PrismaTypes,
  ReviewBatchStatus,
  ReviewQueueKind,
  type SylisDatabase,
} from "@sylis/database";
import {
  LexicalCandidateDisposition,
  type LexicalCandidateEnvelope,
  type LexicalCandidatePort,
  LexicalCandidateRiskClass,
  type LexicalCandidateResolution,
  type LexicalCandidateSubmission,
  LexicalCandidateTaskType,
} from "@sylis/lexicon-compiler";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

const RISK_POLICY_VERSION = "lexical-candidate-review/1";

const digest = (value: unknown): string =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

const databaseRiskClass: Record<
  LexicalCandidateRiskClass,
  DatabaseCandidateRiskClass
> = {
  [LexicalCandidateRiskClass.LOW]: DatabaseCandidateRiskClass.LOW,
  [LexicalCandidateRiskClass.MEDIUM]: DatabaseCandidateRiskClass.MEDIUM,
  [LexicalCandidateRiskClass.HIGH]: DatabaseCandidateRiskClass.HIGH,
};

const rejectedStatuses = new Set<CandidateStatus>([
  CandidateStatus.REJECTED,
  CandidateStatus.FAILED,
  CandidateStatus.SUPERSEDED,
]);

function payload<T>(value: PrismaTypes.JsonValue): LexicalCandidateEnvelope<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LEXICAL_CANDIDATE_PAYLOAD_INVALID");
  }
  return value as unknown as LexicalCandidateEnvelope<T>;
}

export function createLexicalCandidatePort(
  database: SylisDatabase,
  buildRunId: string,
): LexicalCandidatePort {
  const pendingRevisionIds = new Set<string>();

  const resolveStored = <T>(candidate: {
    status: CandidateStatus;
    currentRevision: { id: string; payload: PrismaTypes.JsonValue } | null;
  }): LexicalCandidateResolution<T> | null => {
    if (!candidate.currentRevision) {
      if (candidate.status === CandidateStatus.PLANNED) return null;
      throw new Error("LEXICAL_CANDIDATE_CURRENT_REVISION_MISSING");
    }
    if (
      candidate.status === CandidateStatus.APPROVED ||
      candidate.status === CandidateStatus.PROMOTED
    ) {
      return {
        disposition: LexicalCandidateDisposition.APPROVED,
        candidateRevisionId: candidate.currentRevision.id,
        payload: payload<T>(candidate.currentRevision.payload),
      };
    }
    if (rejectedStatuses.has(candidate.status)) {
      return {
        disposition: LexicalCandidateDisposition.REJECTED,
        candidateRevisionId: candidate.currentRevision.id,
        payload: null,
      };
    }
    pendingRevisionIds.add(candidate.currentRevision.id);
    return {
      disposition: LexicalCandidateDisposition.REVIEW_PENDING,
      candidateRevisionId: candidate.currentRevision.id,
      payload: null,
    };
  };

  return {
    async resolve<T>(candidateKey: string, taskType: LexicalCandidateTaskType) {
      const candidate = await database.candidate.findUnique({
        where: { buildRunId_candidateKey: { buildRunId, candidateKey } },
        include: { currentRevision: true },
      });
      if (!candidate) return null;
      if (candidate.taskType !== CandidateTaskType.LEXICAL_FACT) {
        throw new Error(`LEXICAL_CANDIDATE_FAMILY_MISMATCH:${candidate.id}`);
      }
      if (
        candidate.currentRevision &&
        payload(candidate.currentRevision.payload).taskType !== taskType
      ) {
        throw new Error(`LEXICAL_CANDIDATE_TASK_MISMATCH:${candidate.id}`);
      }
      const resolution = resolveStored<T>(candidate);
      return resolution;
    },

    async submit<T>(submission: LexicalCandidateSubmission<T>) {
      const existing = await database.candidate.findUnique({
        where: {
          buildRunId_candidateKey: {
            buildRunId,
            candidateKey: submission.candidateKey,
          },
        },
        include: { currentRevision: true },
      });
      if (existing?.currentRevision) {
        if (
          payload(existing.currentRevision.payload).taskType !==
          submission.payload.taskType
        ) {
          throw new Error(`LEXICAL_CANDIDATE_TASK_MISMATCH:${existing.id}`);
        }
        return resolveStored<T>(existing)!;
      }
      const evidence = submission.sourceRecordIds.map((sourceRecordId) => ({
        evidenceKind: ContentEvidenceKind.DIRECT,
        sourceRecordId,
        upstreamProvenanceId: null,
        note: null,
      }));
      const contentHash = digest(submission.payload);
      const evidenceSetHash = digest(evidence);
      const candidate = await database.$transaction(async (transaction) => {
        const stored =
          existing ??
          (await transaction.candidate.create({
            data: {
              buildRunId,
              candidateKey: submission.candidateKey,
              taskType: CandidateTaskType.LEXICAL_FACT,
              riskClass: databaseRiskClass[submission.riskClass],
              status: CandidateStatus.PLANNED,
            },
            include: { currentRevision: true },
          }));
        const revision = await transaction.candidateRevision.create({
          data: {
            candidateId: stored.id,
            revisionNo: 1,
            schemaVersion: submission.payload.schemaVersion,
            payload:
              submission.payload as unknown as PrismaTypes.InputJsonValue,
            contentHash,
            evidenceSetHash,
            validationSummary:
              submission.validationSummary as unknown as PrismaTypes.InputJsonValue,
            createdBy: "LEXICON_BUILDER",
            reason: "MODEL_OUTPUT_LOCAL_VALIDATION_PASSED",
            evidence: { create: evidence },
          },
        });
        await transaction.candidate.update({
          where: { id: stored.id },
          data: {
            currentRevisionId: revision.id,
            status: CandidateStatus.GENERATED,
          },
        });
        await transaction.candidate.update({
          where: { id: stored.id },
          data: { status: CandidateStatus.AUTO_VALIDATED },
        });
        return transaction.candidate.update({
          where: { id: stored.id },
          data: {
            status: CandidateStatus.REVIEW_PENDING,
          },
          include: { currentRevision: true },
        });
      });
      return resolveStored<T>(candidate)!;
    },

    async finalizeReviewBatch() {
      const revisionIds = [...pendingRevisionIds].sort();
      pendingRevisionIds.clear();
      if (revisionIds.length === 0) {
        return { reviewBatchId: null, pendingCount: 0 };
      }
      const revisions = await database.candidateRevision.findMany({
        where: { id: { in: revisionIds } },
        include: { candidate: true },
      });
      const pending = revisions
        .filter(
          (revision) =>
            revision.candidate.buildRunId === buildRunId &&
            revision.candidate.currentRevisionId === revision.id &&
            revision.candidate.status === CandidateStatus.REVIEW_PENDING,
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      if (pending.length === 0) {
        return { reviewBatchId: null, pendingCount: 0 };
      }
      if (pending.length !== revisionIds.length) {
        throw new Error("LEXICAL_REVIEW_PENDING_SET_CHANGED");
      }
      const candidateSetHash = digest(pending.map((revision) => revision.id));
      const batch = await database.reviewBatch.upsert({
        where: {
          buildRunId_candidateSetHash: { buildRunId, candidateSetHash },
        },
        create: {
          buildRunId,
          riskPolicyVersion: RISK_POLICY_VERSION,
          candidateSetHash,
          samplePlan: {
            mode: "ALL",
            reason: "LEXICAL_AI_FACT_REQUIRES_REVIEW",
          },
          queueKind: ReviewQueueKind.LEXICAL_FACT,
          status: ReviewBatchStatus.IN_REVIEW,
          items: {
            create: pending.map((revision, position) => ({
              candidateRevisionId: revision.id,
              riskClass: revision.candidate.riskClass,
              position,
            })),
          },
        },
        update: {},
      });
      return { reviewBatchId: batch.id, pendingCount: pending.length };
    },
  };
}
