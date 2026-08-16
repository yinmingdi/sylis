import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CredentialOwnerKind,
  CredentialSecurityEventKind,
  CredentialStatus,
  CredentialType,
  ImmutableReleaseStatus,
  ModelPermitStatus,
  ModelPolicyScopeKind,
  OperatorRole,
  ProviderHealthProbeKind,
  ProviderHealthStatus,
  ProviderRouteSecurityEventKind,
  SecurityAuditCategory,
  SecurityAuditResult,
  type ModelPurposeKind,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash, randomUUID } from "node:crypto";

import { MODEL_DATABASE } from "../../platform/database/database.module";
import { CredentialCryptoService } from "../../platform/encryption/credential-crypto.service";
import { ProviderError } from "../../providers/contracts";
import { ProviderRegistry } from "../../providers/provider-registry";
import {
  ModelCredentialValidationKind,
  modelCredentialValidationRequest,
} from "../credentials/model-credential-validation";
import {
  PermitReservationSelectorKind,
  terminateIssuedPermitReservations,
} from "../invocations/permit-reservation";

export interface ModelAdminActor {
  userId: string;
  sessionId: string;
  roles: OperatorRole[];
}

export interface CreateCredentialInput {
  providerKey: string;
  label: string;
  credentialType: CredentialType;
  secret: string;
  metadata: Record<string, unknown>;
  expiresAt?: string;
  reason: string;
}

@Injectable()
export class AdminModelService {
  constructor(
    @Inject(MODEL_DATABASE) private readonly database: SylisDatabase,
    private readonly credentialCrypto: CredentialCryptoService,
    private readonly providers: ProviderRegistry,
  ) {}

  async overview(serviceKey: string, actor: ModelAdminActor) {
    this.requireAdmin(serviceKey, actor, [
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    const [routes, credentials, invocations] = await Promise.all([
      this.database.providerRouteRelease.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.database.credentialProfile.groupBy({
        by: ["status"],
        where: { ownerKind: CredentialOwnerKind.PLATFORM },
        _count: { _all: true },
      }),
      this.database.modelInvocation.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);
    return { routes, credentials, invocations };
  }

  routes(serviceKey: string, actor: ModelAdminActor) {
    this.requireAdmin(serviceKey, actor, [
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    return this.database.providerRouteRelease.findMany({
      select: {
        id: true,
        providerKey: true,
        modelId: true,
        endpointClass: true,
        capabilities: true,
        adapterVersion: true,
        pricingVersion: true,
        pricing: true,
        policyVersion: true,
        releaseDigest: true,
        status: true,
        createdAt: true,
        healthObservations: {
          orderBy: { observedAt: "desc" },
          take: 1,
        },
        securityEvents: { orderBy: { occurredAt: "desc" }, take: 20 },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  credentials(serviceKey: string, actor: ModelAdminActor) {
    this.requireAdmin(serviceKey, actor, [
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    return this.database.credentialProfile.findMany({
      where: { ownerKind: CredentialOwnerKind.PLATFORM },
      select: {
        id: true,
        ownerKind: true,
        providerKey: true,
        label: true,
        status: true,
        currentRevisionId: true,
        createdAt: true,
        revisions: {
          select: {
            id: true,
            revisionNo: true,
            credentialType: true,
            status: true,
            fingerprintVersion: true,
            maskedHint: true,
            metadata: true,
            validatedAt: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
            kekVersion: true,
          },
          orderBy: { revisionNo: "desc" },
        },
        securityEvents: { orderBy: { occurredAt: "desc" }, take: 50 },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createCredential(
    serviceKey: string,
    actor: ModelAdminActor,
    input: CreateCredentialInput,
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.MODEL_OPERATOR]);
    requireReason(input.reason);
    this.providers.resolve(input.providerKey);
    const profileId = randomUUID();
    const revisionId = randomUUID();
    const envelope = await this.credentialCrypto.encrypt({
      id: revisionId,
      profileId,
      providerKey: input.providerKey,
      secret: input.secret,
    });
    const actionDigest = digest({
      action: "credential.create",
      providerKey: input.providerKey,
      label: input.label,
      credentialType: input.credentialType,
      metadata: input.metadata,
      expiresAt: input.expiresAt,
    });
    return this.database.$transaction(async (transaction) => {
      const profile = await transaction.credentialProfile.create({
        data: {
          id: profileId,
          ownerKind: CredentialOwnerKind.PLATFORM,
          providerKey: input.providerKey,
          label: input.label,
          status: CredentialStatus.PENDING,
        },
      });
      const revision = await transaction.credentialRevision.create({
        data: {
          id: revisionId,
          profileId,
          revisionNo: 1,
          credentialType: input.credentialType,
          status: CredentialStatus.PENDING,
          ciphertext: envelope.ciphertext,
          nonce: envelope.nonce,
          authTag: envelope.authTag,
          encryptedDek: envelope.encryptedDek,
          dekNonce: envelope.dekNonce,
          dekAuthTag: envelope.dekAuthTag,
          kekVersion: envelope.kekVersion,
          aadSchemaVersion: envelope.aadSchemaVersion,
          fingerprint: envelope.fingerprint,
          fingerprintVersion: envelope.fingerprintVersion,
          maskedHint: envelope.maskedHint,
          metadata: input.metadata as PrismaTypes.InputJsonValue,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId,
          credentialRevisionId: revisionId,
          kind: CredentialSecurityEventKind.CREATED,
          reason: input.reason,
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await transaction.securityAuditEvent.createMany({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.MODEL,
          action: "credential.created",
          targetType: "CredentialProfile",
          targetId: profileId,
          targetRevisionId: revisionId,
          actionDigest,
          result: SecurityAuditResult.SUCCEEDED,
          reason: input.reason,
          metadata: {
            providerKey: input.providerKey,
            maskedHint: envelope.maskedHint,
          },
        },
      });
      return {
        ...profile,
        revisions: [publicRevision(revision)],
      };
    });
  }

  async rotateCredential(
    serviceKey: string,
    actor: ModelAdminActor,
    profileId: string,
    input: Omit<CreateCredentialInput, "providerKey" | "label">,
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.MODEL_OPERATOR]);
    requireReason(input.reason);
    const profile = await this.database.credentialProfile.findUnique({
      where: { id: profileId },
      include: { revisions: { orderBy: { revisionNo: "desc" }, take: 1 } },
    });
    if (!profile || profile.ownerKind !== CredentialOwnerKind.PLATFORM) {
      throw new NotFoundException("CREDENTIAL_PROFILE_NOT_FOUND");
    }
    if (
      profile.status === CredentialStatus.QUARANTINED ||
      profile.status === CredentialStatus.REVOKED
    ) {
      throw new ConflictException("CREDENTIAL_PROFILE_NOT_ROTATABLE");
    }
    const revisionId = randomUUID();
    const envelope = await this.credentialCrypto.encrypt({
      id: revisionId,
      profileId,
      providerKey: profile.providerKey,
      secret: input.secret,
    });
    const actionDigest = digest({
      action: "credential.rotate",
      profileId,
      credentialType: input.credentialType,
      metadata: input.metadata,
      expiresAt: input.expiresAt,
    });
    const revision = await this.database.$transaction(async (transaction) => {
      const created = await transaction.credentialRevision.create({
        data: {
          id: revisionId,
          profileId,
          revisionNo: (profile.revisions[0]?.revisionNo ?? 0) + 1,
          credentialType: input.credentialType,
          status: CredentialStatus.PENDING,
          ciphertext: envelope.ciphertext,
          nonce: envelope.nonce,
          authTag: envelope.authTag,
          encryptedDek: envelope.encryptedDek,
          dekNonce: envelope.dekNonce,
          dekAuthTag: envelope.dekAuthTag,
          kekVersion: envelope.kekVersion,
          aadSchemaVersion: envelope.aadSchemaVersion,
          fingerprint: envelope.fingerprint,
          fingerprintVersion: envelope.fingerprintVersion,
          maskedHint: envelope.maskedHint,
          metadata: input.metadata as PrismaTypes.InputJsonValue,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId,
          credentialRevisionId: revisionId,
          kind: CredentialSecurityEventKind.ROTATED,
          reason: input.reason,
          actorRef: actor.userId,
          actionDigest,
        },
      });
      return created;
    });
    return publicRevision(revision);
  }

  async validateCredential(
    serviceKey: string,
    actor: ModelAdminActor,
    revisionId: string,
    routeReleaseId: string,
    reason: string,
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.MODEL_OPERATOR]);
    const [revision, route] = await Promise.all([
      this.database.credentialRevision.findUnique({
        where: { id: revisionId },
        include: { profile: true },
      }),
      this.database.providerRouteRelease.findUnique({
        where: { id: routeReleaseId },
      }),
    ]);
    if (!revision || revision.status !== CredentialStatus.PENDING) {
      throw new ConflictException("CREDENTIAL_REVISION_NOT_PENDING");
    }
    requireReason(reason);
    if (revision.expiresAt && revision.expiresAt <= new Date()) {
      throw new ConflictException("CREDENTIAL_REVISION_EXPIRED");
    }
    if (
      revision.profile.status === CredentialStatus.QUARANTINED ||
      revision.profile.status === CredentialStatus.REVOKED
    ) {
      throw new ConflictException("CREDENTIAL_PROFILE_NOT_VALIDATABLE");
    }
    if (
      !route ||
      route.status !== ImmutableReleaseStatus.PUBLISHED ||
      route.providerKey !== revision.profile.providerKey
    ) {
      throw new ConflictException("CREDENTIAL_VALIDATION_ROUTE_INVALID");
    }
    const apiKey = await this.credentialCrypto.decrypt(
      revision,
      revision.profile.providerKey,
    );
    await this.providers.resolve(route.providerKey).structured<{ ok: true }>({
      route: {
        providerKey: route.providerKey,
        modelId: route.modelId,
        endpointClass: route.endpointClass,
      },
      apiKey,
      request: modelCredentialValidationRequest(
        ModelCredentialValidationKind.PLATFORM_CREDENTIAL,
        revision.id,
      ),
    });
    const actionDigest = digest({
      action: "credential.validate",
      revisionId,
      routeReleaseId,
    });
    return this.database.$transaction(async (transaction) => {
      if (revision.profile.currentRevisionId) {
        await terminateIssuedPermitReservations(
          transaction,
          {
            kind: PermitReservationSelectorKind.CREDENTIAL_PROFILE,
            profileId: revision.profileId,
          },
          ModelPermitStatus.REVOKED,
        );
        await transaction.credentialRevision.update({
          where: { id: revision.profile.currentRevisionId },
          data: { status: CredentialStatus.RETIRED },
        });
      }
      const validated = await transaction.credentialRevision.update({
        where: { id: revisionId },
        data: {
          status: CredentialStatus.VERIFIED,
          validatedAt: new Date(),
        },
      });
      await transaction.credentialProfile.update({
        where: { id: revision.profileId },
        data: {
          status: CredentialStatus.VERIFIED,
          currentRevisionId: revisionId,
        },
      });
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId: revision.profileId,
          credentialRevisionId: revisionId,
          kind: CredentialSecurityEventKind.VALIDATED,
          reason,
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await transaction.securityAuditEvent.createMany({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.MODEL,
          action: "credential.validated",
          targetType: "CredentialProfile",
          targetId: revision.profileId,
          targetRevisionId: revisionId,
          actionDigest,
          result: SecurityAuditResult.SUCCEEDED,
          reason,
          metadata: { routeReleaseId },
        },
      });
      return publicRevision(validated);
    });
  }

  async revokeCredential(
    serviceKey: string,
    actor: ModelAdminActor,
    profileId: string,
    reason: string,
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.MODEL_OPERATOR]);
    requireReason(reason);
    const profile = await this.database.credentialProfile.findUnique({
      where: { id: profileId },
      include: { currentRevision: true },
    });
    if (!profile || profile.ownerKind !== CredentialOwnerKind.PLATFORM) {
      throw new NotFoundException("CREDENTIAL_PROFILE_NOT_FOUND");
    }
    if (profile.status === CredentialStatus.REVOKED) {
      throw new ConflictException("CREDENTIAL_PROFILE_ALREADY_REVOKED");
    }
    const actionDigest = digest({ action: "credential.revoke", profileId });
    await this.database.$transaction(async (transaction) => {
      await transaction.credentialProfile.update({
        where: { id: profileId },
        data: { status: CredentialStatus.REVOKED },
      });
      if (profile.currentRevision) {
        await transaction.credentialRevision.update({
          where: { id: profile.currentRevision.id },
          data: { status: CredentialStatus.REVOKED, revokedAt: new Date() },
        });
      }
      await terminateIssuedPermitReservations(
        transaction,
        {
          kind: PermitReservationSelectorKind.CREDENTIAL_PROFILE,
          profileId,
        },
        ModelPermitStatus.REVOKED,
      );
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId,
          credentialRevisionId: profile.currentRevisionId,
          kind: CredentialSecurityEventKind.REVOKED,
          reason,
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await writeModelAudit(transaction, actor, {
        action: "credential.revoked",
        targetType: "CredentialProfile",
        targetId: profileId,
        targetRevisionId: profile.currentRevisionId,
        actionDigest,
        reason,
      });
    });
    return { id: profileId, status: CredentialStatus.REVOKED };
  }

  async quarantineCredential(
    serviceKey: string,
    actor: ModelAdminActor,
    profileId: string,
    reason: string,
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.SECURITY_ADMIN]);
    requireReason(reason);
    const profile = await this.database.credentialProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("CREDENTIAL_PROFILE_NOT_FOUND");
    if (profile.status === CredentialStatus.REVOKED) {
      throw new ConflictException("REVOKED_CREDENTIAL_CANNOT_BE_QUARANTINED");
    }
    if (profile.status === CredentialStatus.QUARANTINED) {
      throw new ConflictException("CREDENTIAL_PROFILE_ALREADY_QUARANTINED");
    }
    const actionDigest = digest({ action: "credential.quarantine", profileId });
    await this.database.$transaction(async (transaction) => {
      await transaction.credentialProfile.update({
        where: { id: profileId },
        data: { status: CredentialStatus.QUARANTINED },
      });
      await terminateIssuedPermitReservations(
        transaction,
        {
          kind: PermitReservationSelectorKind.CREDENTIAL_PROFILE,
          profileId,
        },
        ModelPermitStatus.REVOKED,
      );
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId,
          credentialRevisionId: profile.currentRevisionId,
          kind: CredentialSecurityEventKind.QUARANTINED,
          reason,
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await writeModelAudit(transaction, actor, {
        action: "credential.quarantined",
        targetType: "CredentialProfile",
        targetId: profileId,
        targetRevisionId: profile.currentRevisionId,
        actionDigest,
        reason,
      });
    });
    return { id: profileId, status: CredentialStatus.QUARANTINED };
  }

  async restoreCredential(
    serviceKey: string,
    actor: ModelAdminActor,
    profileId: string,
    reason: string,
  ) {
    this.requireAllAdmin(serviceKey, actor, [
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    requireReason(reason);
    const profile = await this.database.credentialProfile.findUnique({
      where: { id: profileId },
      include: { currentRevision: true },
    });
    if (!profile) throw new NotFoundException("CREDENTIAL_PROFILE_NOT_FOUND");
    if (profile.status !== CredentialStatus.QUARANTINED) {
      throw new ConflictException("CREDENTIAL_PROFILE_NOT_QUARANTINED");
    }
    if (
      !profile.currentRevision ||
      profile.currentRevision.status !== CredentialStatus.VERIFIED ||
      profile.currentRevision.revokedAt ||
      (profile.currentRevision.expiresAt &&
        profile.currentRevision.expiresAt <= new Date())
    ) {
      throw new ConflictException("CREDENTIAL_CURRENT_REVISION_NOT_RESTORABLE");
    }
    const actionDigest = digest({ action: "credential.restore", profileId });
    await this.database.$transaction(async (transaction) => {
      await transaction.credentialProfile.update({
        where: { id: profileId },
        data: { status: CredentialStatus.VERIFIED },
      });
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId,
          credentialRevisionId: profile.currentRevisionId,
          kind: CredentialSecurityEventKind.RESTORED,
          reason,
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await writeModelAudit(transaction, actor, {
        action: "credential.restored",
        targetType: "CredentialProfile",
        targetId: profileId,
        targetRevisionId: profile.currentRevisionId,
        actionDigest,
        reason,
      });
    });
    return { id: profileId, status: CredentialStatus.VERIFIED };
  }

  async revokeRoute(
    serviceKey: string,
    actor: ModelAdminActor,
    routeReleaseId: string,
    reason: string,
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.SECURITY_ADMIN]);
    requireReason(reason);
    const route = await this.database.providerRouteRelease.findUnique({
      where: { id: routeReleaseId },
    });
    if (!route) throw new NotFoundException("MODEL_ROUTE_NOT_FOUND");
    if (route.status !== ImmutableReleaseStatus.PUBLISHED) {
      throw new ConflictException("MODEL_ROUTE_NOT_PUBLISHED");
    }
    const actionDigest = digest({
      action: "route.security-revoke",
      routeReleaseId,
    });
    await this.database.$transaction(async (transaction) => {
      await transaction.providerRouteRelease.update({
        where: { id: routeReleaseId },
        data: { status: ImmutableReleaseStatus.REVOKED, revokedAt: new Date() },
      });
      await terminateIssuedPermitReservations(
        transaction,
        {
          kind: PermitReservationSelectorKind.ROUTE_RELEASE,
          routeReleaseId,
        },
        ModelPermitStatus.REVOKED,
      );
      await transaction.providerRouteSecurityEvent.create({
        data: {
          routeReleaseId,
          kind: ProviderRouteSecurityEventKind.SECURITY_REVOKED,
          reason,
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await writeModelAudit(transaction, actor, {
        action: "provider-route.security-revoked",
        targetType: "ProviderRouteRelease",
        targetId: routeReleaseId,
        actionDigest,
        reason,
      });
    });
    return { id: routeReleaseId, status: ImmutableReleaseStatus.REVOKED };
  }

  async restoreRoute(
    serviceKey: string,
    actor: ModelAdminActor,
    routeReleaseId: string,
    reason: string,
  ) {
    this.requireAllAdmin(serviceKey, actor, [
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    requireReason(reason);
    const route = await this.database.providerRouteRelease.findUnique({
      where: { id: routeReleaseId },
    });
    if (!route) throw new NotFoundException("MODEL_ROUTE_NOT_FOUND");
    if (route.status !== ImmutableReleaseStatus.REVOKED) {
      throw new ConflictException("MODEL_ROUTE_NOT_REVOKED");
    }
    const actionDigest = digest({ action: "route.restore", routeReleaseId });
    await this.database.$transaction(async (transaction) => {
      await transaction.providerRouteRelease.update({
        where: { id: routeReleaseId },
        data: { status: ImmutableReleaseStatus.PUBLISHED, revokedAt: null },
      });
      await transaction.providerRouteSecurityEvent.create({
        data: {
          routeReleaseId,
          kind: ProviderRouteSecurityEventKind.RESTORED,
          reason,
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await writeModelAudit(transaction, actor, {
        action: "provider-route.restored",
        targetType: "ProviderRouteRelease",
        targetId: routeReleaseId,
        actionDigest,
        reason,
      });
    });
    return { id: routeReleaseId, status: ImmutableReleaseStatus.PUBLISHED };
  }

  async probeRoute(
    serviceKey: string,
    actor: ModelAdminActor,
    routeReleaseId: string,
    credentialRevisionId: string,
    probeKind: ProviderHealthProbeKind,
    reason: string,
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.MODEL_OPERATOR]);
    requireReason(reason);
    const [route, revision] = await Promise.all([
      this.database.providerRouteRelease.findUnique({
        where: { id: routeReleaseId },
      }),
      this.database.credentialRevision.findUnique({
        where: { id: credentialRevisionId },
        include: { profile: true },
      }),
    ]);
    if (!route || route.status !== ImmutableReleaseStatus.PUBLISHED) {
      throw new ConflictException("MODEL_ROUTE_NOT_AVAILABLE");
    }
    if (
      !revision ||
      revision.status !== CredentialStatus.VERIFIED ||
      revision.profile.status !== CredentialStatus.VERIFIED ||
      revision.profile.currentRevisionId !== revision.id ||
      revision.profile.providerKey !== route.providerKey ||
      revision.revokedAt ||
      (revision.expiresAt && revision.expiresAt <= new Date())
    ) {
      throw new ConflictException("MODEL_CREDENTIAL_NOT_AVAILABLE");
    }
    const startedAt = Date.now();
    try {
      const apiKey = await this.credentialCrypto.decrypt(
        revision,
        route.providerKey,
      );
      await this.providers.resolve(route.providerKey).structured<{ ok: true }>({
        route: {
          providerKey: route.providerKey,
          modelId: route.modelId,
          endpointClass: route.endpointClass,
        },
        apiKey,
        request: modelCredentialValidationRequest(
          ModelCredentialValidationKind.PROVIDER_HEALTH,
          routeReleaseId,
        ),
      });
      const observation = await this.database.providerHealthObservation.create({
        data: {
          routeReleaseId,
          probeKind,
          status: ProviderHealthStatus.HEALTHY,
          latencyMs: Date.now() - startedAt,
        },
      });
      await this.database.securityAuditEvent.createMany({
        data: modelAuditData(actor, {
          action: "provider-route.health-probed",
          targetType: "ProviderRouteRelease",
          targetId: routeReleaseId,
          actionDigest: digest({
            action: "route.probe",
            routeReleaseId,
            probeKind,
          }),
          reason,
          metadata: { observationId: observation.id, probeKind },
        }),
      });
      return observation;
    } catch (error) {
      const errorClass = stableErrorClass(error);
      const observation = await this.database.providerHealthObservation.create({
        data: {
          routeReleaseId,
          probeKind,
          status: ProviderHealthStatus.UNAVAILABLE,
          latencyMs: Date.now() - startedAt,
          errorClass,
        },
      });
      await this.database.securityAuditEvent.createMany({
        data: modelAuditData(
          actor,
          {
            action: "provider-route.health-probed",
            targetType: "ProviderRouteRelease",
            targetId: routeReleaseId,
            actionDigest: digest({
              action: "route.probe",
              routeReleaseId,
              probeKind,
            }),
            reason,
            metadata: { observationId: observation.id, probeKind, errorClass },
          },
          SecurityAuditResult.FAILED,
        ),
      });
      throw error;
    }
  }

  async usage(serviceKey: string, actor: ModelAdminActor) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.MODEL_OPERATOR]);
    const [totals, invocations, budgets, quotas] = await Promise.all([
      this.database.modelUsageLedger.groupBy({
        by: ["purpose", "credentialOwnerKind", "currency"],
        _sum: { units: true, costMicros: true },
        _count: { _all: true },
      }),
      this.database.modelInvocation.findMany({
        select: {
          id: true,
          purpose: true,
          ownerType: true,
          routeReleaseId: true,
          credentialRevisionId: true,
          status: true,
          inputTokens: true,
          outputTokens: true,
          cacheHitTokens: true,
          costMicros: true,
          latencyMs: true,
          errorClass: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.database.budgetPolicy.findMany({
        orderBy: { effectiveAt: "desc" },
        take: 100,
      }),
      this.database.quotaPolicy.findMany({
        orderBy: { effectiveAt: "desc" },
        take: 100,
      }),
    ]);
    return {
      totals: totals.map(jsonSafe),
      invocations: invocations.map(jsonSafe),
      budgets: budgets.map(jsonSafe),
      quotas: quotas.map(jsonSafe),
    };
  }

  async createBudget(
    serviceKey: string,
    actor: ModelAdminActor,
    input: {
      scopeKind: ModelPolicyScopeKind;
      scopeId?: string;
      purpose: ModelPurposeKind;
      maxUnits: string;
      maxCostMicros: string;
      windowSeconds: number;
      policyVersion: string;
      reason: string;
    },
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.MODEL_OPERATOR]);
    requireReason(input.reason);
    assertPolicyScope(input.scopeKind, input.scopeId);
    const maxUnits = positiveBigInt(
      input.maxUnits,
      "MODEL_BUDGET_MAX_UNITS_INVALID",
    );
    const maxCostMicros = positiveBigInt(
      input.maxCostMicros,
      "MODEL_BUDGET_MAX_COST_INVALID",
    );
    assertWindowSeconds(input.windowSeconds);
    const actionDigest = digest({ action: "budget.create", ...input });
    const budget = await this.database.$transaction(async (transaction) => {
      const created = await transaction.budgetPolicy.create({
        data: {
          scopeKind: input.scopeKind,
          scopeId: input.scopeId,
          purpose: input.purpose,
          maxUnits,
          maxCostMicros,
          windowSeconds: input.windowSeconds,
          policyVersion: input.policyVersion,
          effectiveAt: new Date(),
          createdByRef: actor.userId,
          actionDigest,
        },
      });
      await writeModelAudit(transaction, actor, {
        action: "budget-policy.created",
        targetType: "BudgetPolicy",
        targetId: created.id,
        actionDigest,
        reason: input.reason,
      });
      return created;
    });
    return jsonSafe(budget);
  }

  async createQuota(
    serviceKey: string,
    actor: ModelAdminActor,
    input: {
      scopeKind: ModelPolicyScopeKind;
      scopeId?: string;
      purpose: ModelPurposeKind;
      routeReleaseId?: string;
      maxRequests: string;
      maxUnits: string;
      windowSeconds: number;
      policyVersion: string;
      reason: string;
    },
  ) {
    this.requireAdmin(serviceKey, actor, [OperatorRole.MODEL_OPERATOR]);
    requireReason(input.reason);
    assertPolicyScope(input.scopeKind, input.scopeId);
    const maxRequests = positiveBigInt(
      input.maxRequests,
      "MODEL_QUOTA_MAX_REQUESTS_INVALID",
    );
    const maxUnits = positiveBigInt(
      input.maxUnits,
      "MODEL_QUOTA_MAX_UNITS_INVALID",
    );
    assertWindowSeconds(input.windowSeconds);
    if (input.routeReleaseId) {
      const route = await this.database.providerRouteRelease.findUnique({
        where: { id: input.routeReleaseId },
        select: { id: true },
      });
      if (!route) throw new NotFoundException("MODEL_ROUTE_NOT_FOUND");
    }
    const actionDigest = digest({ action: "quota.create", ...input });
    const quota = await this.database.$transaction(async (transaction) => {
      const created = await transaction.quotaPolicy.create({
        data: {
          scopeKind: input.scopeKind,
          scopeId: input.scopeId,
          purpose: input.purpose,
          routeReleaseId: input.routeReleaseId,
          maxRequests,
          maxUnits,
          windowSeconds: input.windowSeconds,
          policyVersion: input.policyVersion,
          effectiveAt: new Date(),
          createdByRef: actor.userId,
          actionDigest,
        },
      });
      await writeModelAudit(transaction, actor, {
        action: "quota-policy.created",
        targetType: "QuotaPolicy",
        targetId: created.id,
        actionDigest,
        reason: input.reason,
      });
      return created;
    });
    return jsonSafe(quota);
  }

  private requireAdmin(
    serviceKey: string,
    actor: ModelAdminActor,
    roles: readonly OperatorRole[],
  ): void {
    if (serviceKey !== "admin-api") {
      throw new ForbiddenException("ADMIN_API_SERVICE_REQUIRED");
    }
    if (!roles.some((role) => actor.roles.includes(role))) {
      throw new ForbiddenException("ADMIN_ROLE_REQUIRED");
    }
  }

  private requireAllAdmin(
    serviceKey: string,
    actor: ModelAdminActor,
    roles: readonly OperatorRole[],
  ): void {
    if (serviceKey !== "admin-api") {
      throw new ForbiddenException("ADMIN_API_SERVICE_REQUIRED");
    }
    if (!roles.every((role) => actor.roles.includes(role))) {
      throw new ForbiddenException("ADMIN_ROLE_CONJUNCTION_REQUIRED");
    }
  }
}

export function publicRevision(revision: {
  id: string;
  profileId: string;
  revisionNo: number;
  credentialType: CredentialType;
  status: CredentialStatus;
  fingerprintVersion: string;
  maskedHint: string;
  metadata: unknown;
  validatedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  kekVersion: string;
}) {
  return {
    id: revision.id,
    profileId: revision.profileId,
    revisionNo: revision.revisionNo,
    credentialType: revision.credentialType,
    status: revision.status,
    fingerprintVersion: revision.fingerprintVersion,
    maskedHint: revision.maskedHint,
    metadata: revision.metadata,
    validatedAt: revision.validatedAt,
    expiresAt: revision.expiresAt,
    revokedAt: revision.revokedAt,
    createdAt: revision.createdAt,
    kekVersion: revision.kekVersion,
  };
}

interface ModelAuditInput {
  action: string;
  targetType: string;
  targetId: string;
  targetRevisionId?: string | null;
  actionDigest: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

async function writeModelAudit(
  transaction: PrismaTypes.TransactionClient,
  actor: ModelAdminActor,
  input: ModelAuditInput,
): Promise<void> {
  await transaction.securityAuditEvent.createMany({
    data: modelAuditData(actor, input),
  });
}

function modelAuditData(
  actor: ModelAdminActor,
  input: ModelAuditInput,
  result: SecurityAuditResult = SecurityAuditResult.SUCCEEDED,
) {
  return {
    actorUserId: actor.userId,
    sessionId: actor.sessionId,
    category: SecurityAuditCategory.MODEL,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    targetRevisionId: input.targetRevisionId ?? null,
    actionDigest: input.actionDigest,
    result,
    reason: input.reason,
    metadata: (input.metadata ?? {}) as PrismaTypes.InputJsonValue,
  };
}

function requireReason(reason: string): void {
  if (reason.trim().length < 8 || reason.length > 500) {
    throw new ConflictException("ADMIN_REASON_INVALID");
  }
}

function positiveBigInt(value: string, errorCode: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new ConflictException(errorCode);
  return BigInt(value);
}

function assertWindowSeconds(value: number): void {
  if (!Number.isSafeInteger(value) || value < 60 || value > 31_536_000) {
    throw new ConflictException("MODEL_POLICY_WINDOW_INVALID");
  }
}

function assertPolicyScope(
  scopeKind: ModelPolicyScopeKind,
  scopeId: string | undefined,
): void {
  if (scopeKind === ModelPolicyScopeKind.PLATFORM) {
    if (scopeId)
      throw new ConflictException("MODEL_PLATFORM_SCOPE_ID_FORBIDDEN");
    return;
  }
  if (!scopeId) throw new ConflictException("MODEL_POLICY_SCOPE_ID_REQUIRED");
}

function stableErrorClass(error: unknown): string {
  if (error instanceof ProviderError) return error.code;
  return error instanceof Error ? error.name : "UNKNOWN";
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as unknown;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
