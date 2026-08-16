import {
  MODEL_EXECUTION_PERMIT_TARGET_INCLUDE,
  ModelPermitStatus,
  ModelUsageEntryType,
  modelExecutionPermitOwner,
  type PrismaTypes,
  type SylisTransaction,
} from "@sylis/database";

export enum PermitReservationSelectorKind {
  CREDENTIAL_PROFILE = "CREDENTIAL_PROFILE",
  OWNER_USER = "OWNER_USER",
  PERMIT = "PERMIT",
  ROUTE_RELEASE = "ROUTE_RELEASE",
}

export type PermitReservationSelector =
  | {
      kind: PermitReservationSelectorKind.CREDENTIAL_PROFILE;
      profileId: string;
    }
  | { kind: PermitReservationSelectorKind.OWNER_USER; ownerUserId: string }
  | { kind: PermitReservationSelectorKind.PERMIT; permitId: string }
  | {
      kind: PermitReservationSelectorKind.ROUTE_RELEASE;
      routeReleaseId: string;
    };

type PermitTerminalStatus =
  | typeof ModelPermitStatus.EXPIRED
  | typeof ModelPermitStatus.REVOKED;

export async function terminateIssuedPermitReservations(
  transaction: SylisTransaction,
  selector: PermitReservationSelector,
  terminalStatus: PermitTerminalStatus,
): Promise<number> {
  const permits = await transaction.modelExecutionPermit.findMany({
    where: {
      status: ModelPermitStatus.ISSUED,
      ...permitSelectorWhere(selector),
    },
    include: {
      ...MODEL_EXECUTION_PERMIT_TARGET_INCLUDE,
      credentialRevision: { include: { profile: true } },
    },
  });

  let terminated = 0;
  for (const permit of permits) {
    const transition = await transaction.modelExecutionPermit.updateMany({
      where: { id: permit.id, status: ModelPermitStatus.ISSUED },
      data: { status: terminalStatus },
    });
    if (transition.count === 0) continue;

    const owner = modelExecutionPermitOwner(permit);
    await transaction.modelUsageLedger.create({
      data: {
        userId: permit.ownerUserId,
        purpose: permit.purpose,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        routeReleaseId: permit.routeReleaseId,
        permitId: permit.id,
        credentialOwnerKind: permit.credentialRevision.profile.ownerKind,
        entryType: ModelUsageEntryType.RELEASE,
        units: -BigInt(permit.maxInputTokens + permit.maxOutputTokens),
        costMicros: -permit.maxCostMicros,
        idempotencyKey: permit.requestKey,
      },
    });
    terminated += 1;
  }

  return terminated;
}

function permitSelectorWhere(
  selector: PermitReservationSelector,
): PrismaTypes.ModelExecutionPermitWhereInput {
  switch (selector.kind) {
    case PermitReservationSelectorKind.CREDENTIAL_PROFILE:
      return { credentialRevision: { profileId: selector.profileId } };
    case PermitReservationSelectorKind.OWNER_USER:
      return { ownerUserId: selector.ownerUserId };
    case PermitReservationSelectorKind.PERMIT:
      return { id: selector.permitId };
    case PermitReservationSelectorKind.ROUTE_RELEASE:
      return { routeReleaseId: selector.routeReleaseId };
  }
}
