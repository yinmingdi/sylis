import { Prisma, type SylisDatabase } from "@sylis/database";

export interface ActivateReleaseCommand {
  lexiconId: string;
  releaseId: string;
  approvalId: string;
  actorUserId: string;
  expectedCurrentReleaseId: string | null;
  reason: string;
  operation?: "ACTIVATE" | "ROLLBACK";
}

export async function activateRelease(
  database: SylisDatabase,
  command: ActivateReleaseCommand,
): Promise<void> {
  await database.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`
      SELECT id FROM "Lexicon" WHERE id = ${command.lexiconId}::uuid FOR UPDATE
    `);
    const [lexicon, release, approval] = await Promise.all([
      transaction.lexicon.findUnique({ where: { id: command.lexiconId } }),
      transaction.lexiconRelease.findUnique({
        where: { id: command.releaseId },
      }),
      transaction.approvalRequest.findUnique({
        where: { id: command.approvalId },
        include: { decisions: true },
      }),
    ]);
    if (!lexicon || !release || release.lexiconId !== lexicon.id) {
      throw new Error("LEXICON_ACTIVATION_TARGET_INVALID");
    }
    if (lexicon.activeReleaseId !== command.expectedCurrentReleaseId) {
      throw new Error("LEXICON_ACTIVATION_CURRENT_RELEASE_CHANGED");
    }
    if (release.status !== "VALIDATED") {
      throw new Error("LEXICON_ACTIVATION_RELEASE_NOT_VALIDATED");
    }
    if (
      !approval ||
      approval.status !== "APPROVED" ||
      approval.expiresAt <= new Date() ||
      approval.requesterId === command.actorUserId ||
      approval.decisions.filter((decision) => decision.decision === "APPROVE")
        .length < 1
    ) {
      throw new Error("LEXICON_ACTIVATION_APPROVAL_INVALID");
    }
    const restrictedInputs = await transaction.lexiconReleaseSourceInput.count({
      where: {
        releaseId: release.id,
        sourceDatasetVersion: {
          rightsPolicy: {
            OR: [{ mayServe: false }, { effectiveTo: { lte: new Date() } }],
          },
        },
      },
    });
    if (restrictedInputs > 0) {
      throw new Error("LEXICON_ACTIVATION_SOURCE_RESTRICTED");
    }
    await transaction.lexiconReleaseActivation.create({
      data: {
        lexiconId: lexicon.id,
        fromReleaseId: lexicon.activeReleaseId,
        toReleaseId: release.id,
        approvalId: approval.id,
        actorUserId: command.actorUserId,
        reason: command.reason,
      },
    });
    await transaction.lexicon.update({
      where: { id: lexicon.id },
      data: { activeReleaseId: release.id },
    });
    await transaction.securityAuditEvent.create({
      data: {
        actorUserId: command.actorUserId,
        eventType:
          command.operation === "ROLLBACK"
            ? "lexicon.release.rolled_back"
            : "lexicon.release.activated",
        subjectType: "LexiconRelease",
        subjectId: release.id,
        actionDigest: approval.actionDigest,
        outcome: "SUCCEEDED",
        metadata: {
          lexiconId: lexicon.id,
          fromReleaseId: lexicon.activeReleaseId,
          toReleaseId: release.id,
          reason: command.reason,
          operation: command.operation ?? "ACTIVATE",
        },
      },
    });
  });
}
