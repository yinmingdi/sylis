import { ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  CredentialSecurityEventKind,
  CredentialStatus,
  JobAttemptStatus,
  JobKind,
  JobOwnerType,
  ModelPermitStatus,
  SecurityAuditCategory,
  SecurityAuditResult,
  type SylisDatabase,
} from "@sylis/database";
import { stableUuid } from "@sylis/utils";
import { createHash, randomBytes } from "node:crypto";

import { ModelContentBodyService } from "./model-content-body.service";
import { ModelExchangeLifecycleService } from "./model-exchange-lifecycle.service";
import { MODEL_DATABASE } from "../../platform/database/database.module";
import {
  PermitReservationSelectorKind,
  terminateIssuedPermitReservations,
} from "../invocations/permit-reservation";

interface RetentionAttempt {
  attemptId: string;
  fencingToken: bigint;
}

@Injectable()
export class UserContentPurgeService {
  constructor(
    @Inject(MODEL_DATABASE) private readonly database: SylisDatabase,
    private readonly bodies: ModelContentBodyService,
    private readonly exchanges: ModelExchangeLifecycleService,
  ) {}

  async purge(
    serviceKey: string,
    requestId: string,
    attempt: RetentionAttempt,
  ) {
    if (serviceKey !== "automation-executor") {
      throw new ConflictException("AUTOMATION_EXECUTOR_REQUIRED");
    }
    const request = await this.database.contentDeletionRequest.findFirst({
      where: {
        id: requestId,
        targetKind: ContentDeletionTargetKind.USER,
        userTarget: { isNot: null },
        status: ContentDeletionStatus.RUNNING,
        purgeAfter: { lte: new Date() },
      },
      include: { userTarget: true },
    });
    if (!request || request.userTarget?.userId !== request.requestedByUserId) {
      throw new ConflictException("USER_DELETION_REQUEST_NOT_PURGEABLE");
    }
    const activeAttempt = await this.database.jobAttempt.findFirst({
      where: {
        id: attempt.attemptId,
        fencingToken: attempt.fencingToken,
        status: JobAttemptStatus.RUNNING,
        leaseExpiresAt: { gt: new Date() },
        job: {
          kind: JobKind.RETENTION_PURGE,
          ownerType: JobOwnerType.RETENTION_REQUEST,
          ownerId: request.id,
        },
      },
      select: { id: true },
    });
    if (!activeAttempt) {
      throw new ConflictException("RETENTION_JOB_FENCING_REJECTED");
    }

    const ownerUserId = request.requestedByUserId;
    const [contentBodies, modelExchanges, profiles] = await Promise.all([
      this.database.modelContentBody.findMany({
        where: { ownerUserId },
        select: { id: true },
      }),
      this.database.modelExchange.findMany({
        where: { invocation: { permit: { ownerUserId } } },
        select: { id: true },
      }),
      this.database.credentialProfile.findMany({
        where: { ownerUserId },
        include: { revisions: { select: { id: true, kekVersion: true } } },
      }),
    ]);

    let purgedExchanges = 0;
    for (const ids of batches(modelExchanges.map(({ id }) => id))) {
      purgedExchanges += (
        await this.exchanges.purge("automation-executor", {
          ownerUserId,
          ids,
          purgeAfter: request.purgeAfter.toISOString(),
        })
      ).exchanges;
    }
    let purgedBodies = 0;
    for (const ids of batches(contentBodies.map(({ id }) => id))) {
      purgedBodies += await this.bodies.cryptoshred(ids, new Date());
    }

    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await terminateIssuedPermitReservations(
        transaction,
        {
          kind: PermitReservationSelectorKind.OWNER_USER,
          ownerUserId,
        },
        ModelPermitStatus.REVOKED,
      );
      for (const profile of profiles) {
        await transaction.credentialProfile.update({
          where: { id: profile.id },
          data: {
            status: CredentialStatus.REVOKED,
            currentRevisionId: null,
          },
        });
        for (const revision of profile.revisions) {
          if (revision.kekVersion === "purged") continue;
          const write = await transaction.credentialRevision.updateMany({
            where: { id: revision.id, kekVersion: { not: "purged" } },
            data: {
              status: CredentialStatus.REVOKED,
              ciphertext: randomBytes(32),
              nonce: randomBytes(12),
              authTag: randomBytes(16),
              encryptedDek: randomBytes(32),
              dekNonce: randomBytes(12),
              dekAuthTag: randomBytes(16),
              kekVersion: "purged",
              fingerprint: digest(`purged:${revision.id}`),
              maskedHint: "purged",
              metadata: {},
              revokedAt: now,
            },
          });
          if (write.count === 0) continue;
          await transaction.credentialSecurityEvent.createMany({
            data: [
              {
                id: stableUuid(
                  `credential-user-content-purge:${request.id}:${revision.id}`,
                ),
                profileId: profile.id,
                credentialRevisionId: revision.id,
                kind: CredentialSecurityEventKind.REVOKED,
                reason: "USER_CONTENT_PURGED",
                actorRef: "automation-executor",
                actionDigest: digest(
                  `user-content-purge:${request.id}:${revision.id}`,
                ),
              },
            ],
            skipDuplicates: true,
          });
        }
      }
      await transaction.securityAuditEvent.createMany({
        data: [
          {
            id: stableUuid(`user-model-content-purge:${request.id}`),
            actorUserId: ownerUserId,
            category: SecurityAuditCategory.MODEL,
            action: "user.model-content.purged",
            targetType: "User",
            targetId: ownerUserId,
            actionDigest: digest(`user-model-purge:${request.id}`),
            result: SecurityAuditResult.SUCCEEDED,
            metadata: {
              requestId: request.id,
              contentBodies: purgedBodies,
              exchanges: purgedExchanges,
              credentialProfiles: profiles.length,
            },
          },
        ],
        skipDuplicates: true,
      });
    });
    return {
      contentBodies: purgedBodies,
      exchanges: purgedExchanges,
      credentialProfiles: profiles.length,
    };
  }
}

function batches<T>(values: readonly T[], size = 10_000): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
