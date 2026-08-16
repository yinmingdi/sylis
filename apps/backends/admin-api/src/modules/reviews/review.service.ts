import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BuildRunActivationReason,
  BuildRunMode,
  BuildRunStatus,
  CandidateStatus,
  ContentEvidenceKind,
  PrismaTypes,
  ReviewBatchStatus,
  ReviewDecisionKind,
  ReviewQueueKind,
  SecurityAuditCategory,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

import type { DecideReviewItemDto, ReviseCandidateDto } from "./review.dto";
import { AdminAuditService } from "../../platform/audit/admin-audit.service";
import type { AdminActor } from "../../platform/auth/admin-actor";
import { ADMIN_DATABASE } from "../../platform/database/database.module";
import { createBuildRunActivation } from "../../platform/jobs/build-run-activation";

@Injectable()
export class ReviewService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
    private readonly audit: AdminAuditService,
  ) {}

  listBatches() {
    return this.database.reviewBatch.findMany({
      include: {
        _count: { select: { items: true, decisions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  batch(batchId: string) {
    return this.database.reviewBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: {
            candidateRevision: {
              include: { candidate: true, evidence: true },
            },
          },
        },
        decisions: { orderBy: { decidedAt: "asc" } },
      },
    });
  }

  reviseCandidate(
    actor: AdminActor,
    candidateId: string,
    input: ReviseCandidateDto,
  ) {
    const contentHash = digest(input.payload);
    const evidence = input.evidence
      .map((item) => ({
        evidenceKind: item.evidenceKind,
        sourceRecordId: item.sourceRecordId ?? null,
        upstreamProvenanceId: item.upstreamProvenanceId ?? null,
        note: item.note?.trim() || null,
      }))
      .sort((left, right) =>
        canonicalJson(left).localeCompare(canonicalJson(right)),
      );
    for (const item of evidence) {
      const targetCount =
        Number(item.sourceRecordId !== null) +
        Number(item.upstreamProvenanceId !== null);
      if (targetCount !== 1) {
        throw new BadRequestException("CANDIDATE_EVIDENCE_TARGET_INVALID");
      }
      if (
        (item.evidenceKind === ContentEvidenceKind.DIRECT &&
          item.sourceRecordId === null) ||
        (item.evidenceKind === ContentEvidenceKind.GENERATED &&
          item.upstreamProvenanceId === null)
      ) {
        throw new BadRequestException("CANDIDATE_EVIDENCE_KIND_INVALID");
      }
    }
    const evidenceSetHash = digest(evidence);
    return this.database.$transaction(async (transaction) => {
      const candidate = await transaction.candidate.findUnique({
        where: { id: candidateId },
        include: {
          buildRun: true,
          currentRevision: true,
          revisions: { orderBy: { revisionNo: "desc" }, take: 1 },
        },
      });
      if (!candidate) throw new NotFoundException("CANDIDATE_NOT_FOUND");
      if (candidate.buildRun.status !== BuildRunStatus.APPROVED) {
        throw new ConflictException("BUILD_RUN_NOT_REVIEWABLE");
      }
      if (candidate.currentRevisionId !== input.expectedRevisionId) {
        throw new ConflictException("CANDIDATE_REVISION_CONFLICT");
      }
      if (candidate.status === CandidateStatus.PROMOTED) {
        throw new ConflictException("PROMOTED_CANDIDATE_IMMUTABLE");
      }
      const revision = await transaction.candidateRevision.create({
        data: {
          candidateId,
          revisionNo: (candidate.revisions[0]?.revisionNo ?? 0) + 1,
          schemaVersion: input.schemaVersion,
          payload: input.payload as PrismaTypes.InputJsonValue,
          contentHash,
          evidenceSetHash,
          validationSummary:
            input.validationSummary as PrismaTypes.InputJsonValue,
          createdBy: actor.userId,
          reason: input.reason,
          evidence: {
            create: evidence,
          },
        },
        include: { evidence: true },
      });
      await transaction.candidate.update({
        where: { id: candidateId },
        data: {
          currentRevisionId: revision.id,
          status: CandidateStatus.REVIEW_PENDING,
        },
      });
      const candidateSetHash = digest([revision.id]);
      await transaction.reviewBatch.create({
        data: {
          buildRunId: candidate.buildRunId,
          riskPolicyVersion: "lexical-candidate-review/1",
          candidateSetHash,
          samplePlan: {
            mode: "ALL",
            reason: "HUMAN_REVISION_REQUIRES_REVIEW",
          },
          queueKind: ReviewQueueKind.LEXICAL_FACT,
          status: ReviewBatchStatus.IN_REVIEW,
          items: {
            create: {
              candidateRevisionId: revision.id,
              riskClass: candidate.riskClass,
              position: 0,
            },
          },
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.REVIEW,
          action: "candidate.revised",
          targetType: "Candidate",
          targetId: candidateId,
          targetRevisionId: revision.id,
          beforeDigest: candidate.currentRevision?.contentHash,
          afterDigest: contentHash,
          reason: input.reason,
          metadata: { revisionNo: revision.revisionNo },
        },
        transaction,
      );
      return revision;
    });
  }

  decide(actor: AdminActor, batchId: string, input: DecideReviewItemDto) {
    if (input.decision === ReviewDecisionKind.ACCEPT_WARNING) {
      throw new BadRequestException("REVIEW_ITEM_DECISION_INVALID");
    }
    const actionDigest = digest({
      batchId,
      candidateRevisionId: input.candidateRevisionId,
      decision: input.decision,
      reason: input.reason,
    });
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        PrismaTypes.sql`SELECT id FROM "ReviewBatch" WHERE id = ${batchId}::uuid FOR UPDATE`,
      );
      const item = await transaction.reviewItem.findUnique({
        where: {
          batchId_candidateRevisionId: {
            batchId,
            candidateRevisionId: input.candidateRevisionId,
          },
        },
        include: {
          batch: { include: { buildRun: true } },
          candidateRevision: { include: { candidate: true } },
        },
      });
      if (!item) throw new NotFoundException("REVIEW_ITEM_NOT_FOUND");
      if (item.batch.buildRun.status !== BuildRunStatus.APPROVED) {
        throw new ConflictException("BUILD_RUN_NOT_REVIEWABLE");
      }
      if (
        item.candidateRevision.candidate.currentRevisionId !==
        input.candidateRevisionId
      ) {
        throw new ConflictException("REVIEW_REVISION_STALE");
      }
      const decision = await transaction.reviewDecision.create({
        data: {
          batchId,
          candidateRevisionId: input.candidateRevisionId,
          actorUserId: actor.userId,
          decision: input.decision,
          reason: input.reason,
          actionDigest,
        },
      });
      await transaction.candidate.update({
        where: { id: item.candidateRevision.candidateId },
        data: {
          status:
            input.decision === ReviewDecisionKind.APPROVE
              ? CandidateStatus.APPROVED
              : CandidateStatus.REJECTED,
        },
      });
      const pendingCount = await transaction.reviewItem.count({
        where: {
          batchId,
          candidateRevision: {
            candidate: { status: CandidateStatus.REVIEW_PENDING },
          },
        },
      });
      let resumeJobId: string | null = null;
      if (pendingCount === 0) {
        const rejectedCount = await transaction.reviewItem.count({
          where: {
            batchId,
            candidateRevision: {
              candidate: { status: CandidateStatus.REJECTED },
            },
          },
        });
        await transaction.reviewBatch.update({
          where: { id: batchId },
          data: {
            status:
              rejectedCount > 0
                ? ReviewBatchStatus.REJECTED
                : ReviewBatchStatus.APPROVED,
          },
        });
        const activation = await createBuildRunActivation(transaction, {
          buildRunId: item.batch.buildRunId,
          reason: BuildRunActivationReason.REVIEW_RESUME,
          reviewBatchId: batchId,
          idempotencyKey: `review-resume:${batchId}`,
          priority: item.batch.buildRun.mode === BuildRunMode.PILOT ? 20 : 10,
        });
        resumeJobId = activation.jobId;
      }
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.REVIEW,
          action: "candidate.review.decided",
          targetType: "Candidate",
          targetId: item.candidateRevision.candidateId,
          targetRevisionId: input.candidateRevisionId,
          actionDigest,
          reason: input.reason,
          metadata: { batchId, decision: input.decision, resumeJobId },
        },
        transaction,
      );
      return { decision, resumeJobId };
    });
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
