import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  CredentialOwnerKind,
  CredentialSecurityEventKind,
  CredentialStatus,
  CredentialType,
  ImmutableReleaseStatus,
  ModelPermitStatus,
  SecurityAuditCategory,
  SecurityAuditResult,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { canonicalJson, stableUuid } from "@sylis/utils";
import { createHash } from "node:crypto";

import {
  ModelCredentialValidationKind,
  modelCredentialValidationRequest,
} from "./model-credential-validation";
import { MODEL_DATABASE } from "../../platform/database/database.module";
import { CredentialCryptoService } from "../../platform/encryption/credential-crypto.service";
import { ProviderError } from "../../providers/contracts";
import { ProviderRegistry } from "../../providers/provider-registry";
import {
  PermitReservationSelectorKind,
  terminateIssuedPermitReservations,
} from "../invocations/permit-reservation";

const USER_CREDENTIAL_SERVICE = "api";
export interface ModelUserActor {
  userId: string;
  sessionId: string;
}

export interface CreateUserCredentialInput {
  providerKey: string;
  routeReleaseId: string;
  label: string;
  credentialType: CredentialType;
  secret: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
  idempotencyKey: string;
}

export type RotateUserCredentialInput = Omit<
  CreateUserCredentialInput,
  "providerKey" | "label"
>;

@Injectable()
export class UserCredentialService {
  constructor(
    @Inject(MODEL_DATABASE) private readonly database: SylisDatabase,
    private readonly credentialCrypto: CredentialCryptoService,
    private readonly providers: ProviderRegistry,
  ) {}

  list(serviceKey: string, actor: ModelUserActor) {
    this.requireUserService(serviceKey, actor);
    return this.database.credentialProfile.findMany({
      where: {
        ownerKind: CredentialOwnerKind.USER,
        ownerUserId: actor.userId,
      },
      select: userCredentialProjection,
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    serviceKey: string,
    actor: ModelUserActor,
    input: CreateUserCredentialInput,
  ) {
    this.requireUserService(serviceKey, actor);
    const providerKey = identifier(input.providerKey, "BYOK_PROVIDER_INVALID");
    const label = text(input.label, "BYOK_LABEL_INVALID", 120);
    const routeReleaseId = uuid(
      input.routeReleaseId,
      "BYOK_VALIDATION_ROUTE_INVALID",
    );
    const idempotencyKey = requestKey(input.idempotencyKey);
    const expiresAt = optionalFutureDate(input.expiresAt);
    const metadata = safeMetadata(input.metadata);
    this.providers.resolve(providerKey);
    const route = await this.requireValidationRoute(
      routeReleaseId,
      providerKey,
    );
    const profileId = stableUuid(
      "user-credential:" + actor.userId + ":create:" + idempotencyKey,
    );
    const revisionId = stableUuid(profileId + ":revision:1");
    const envelope = await this.credentialCrypto.encrypt({
      id: revisionId,
      profileId,
      providerKey,
      secret: secret(input.secret),
    });
    const previous = await this.database.credentialRevision.findUnique({
      where: { id: revisionId },
      include: { profile: true },
    });
    if (previous) {
      assertReplay(previous, {
        actorUserId: actor.userId,
        providerKey,
        label,
        credentialType: credentialType(input.credentialType),
        fingerprint: envelope.fingerprint,
        metadata,
        expiresAt,
      });
      await this.validatePendingRevision(actor, previous.id, route.id);
      return this.requireProfile(actor.userId, previous.profileId);
    }

    await this.database.$transaction(async (transaction) => {
      await transaction.credentialProfile.create({
        data: {
          id: profileId,
          ownerKind: CredentialOwnerKind.USER,
          ownerUserId: actor.userId,
          providerKey,
          label,
          status: CredentialStatus.PENDING,
        },
      });
      await transaction.credentialRevision.create({
        data: {
          id: revisionId,
          profileId,
          revisionNo: 1,
          credentialType: credentialType(input.credentialType),
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
          metadata: metadata as PrismaTypes.InputJsonValue,
          expiresAt,
        },
      });
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId,
          credentialRevisionId: revisionId,
          kind: CredentialSecurityEventKind.CREATED,
          reason: "USER_CREATED_BYOK",
          actorRef: actor.userId,
          actionDigest: digest({
            action: "user-credential.create",
            profileId,
            revisionId,
            providerKey,
            routeReleaseId,
          }),
        },
      });
    });
    await this.validatePendingRevision(actor, revisionId, route.id);
    return this.requireProfile(actor.userId, profileId);
  }

  async rotate(
    serviceKey: string,
    actor: ModelUserActor,
    profileId: string,
    input: RotateUserCredentialInput,
  ) {
    this.requireUserService(serviceKey, actor);
    profileId = uuid(profileId, "BYOK_PROFILE_INVALID");
    const profile = await this.database.credentialProfile.findFirst({
      where: {
        id: profileId,
        ownerKind: CredentialOwnerKind.USER,
        ownerUserId: actor.userId,
      },
      include: { revisions: { orderBy: { revisionNo: "desc" }, take: 1 } },
    });
    if (!profile) throw new NotFoundException("BYOK_PROFILE_NOT_FOUND");
    if (
      profile.status === CredentialStatus.REVOKED ||
      profile.status === CredentialStatus.QUARANTINED
    ) {
      throw new ConflictException("BYOK_PROFILE_NOT_ROTATABLE");
    }
    const routeReleaseId = uuid(
      input.routeReleaseId,
      "BYOK_VALIDATION_ROUTE_INVALID",
    );
    await this.requireValidationRoute(routeReleaseId, profile.providerKey);
    const idempotencyKey = requestKey(input.idempotencyKey);
    const revisionId = stableUuid(
      "user-credential:" +
        actor.userId +
        ":" +
        profileId +
        ":rotate:" +
        idempotencyKey,
    );
    const envelope = await this.credentialCrypto.encrypt({
      id: revisionId,
      profileId,
      providerKey: profile.providerKey,
      secret: secret(input.secret),
    });
    const expiresAt = optionalFutureDate(input.expiresAt);
    const metadata = safeMetadata(input.metadata);
    const previous = await this.database.credentialRevision.findUnique({
      where: { id: revisionId },
      include: { profile: true },
    });
    if (previous) {
      assertReplay(previous, {
        actorUserId: actor.userId,
        providerKey: profile.providerKey,
        label: profile.label,
        credentialType: credentialType(input.credentialType),
        fingerprint: envelope.fingerprint,
        metadata,
        expiresAt,
      });
      await this.validatePendingRevision(actor, previous.id, routeReleaseId);
      return this.requireProfile(actor.userId, profileId);
    }

    await this.database.$transaction(async (transaction) => {
      await transaction.credentialRevision.create({
        data: {
          id: revisionId,
          profileId,
          revisionNo: (profile.revisions[0]?.revisionNo ?? 0) + 1,
          credentialType: credentialType(input.credentialType),
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
          metadata: metadata as PrismaTypes.InputJsonValue,
          expiresAt,
        },
      });
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId,
          credentialRevisionId: revisionId,
          kind: CredentialSecurityEventKind.ROTATED,
          reason: "USER_ROTATED_BYOK",
          actorRef: actor.userId,
          actionDigest: digest({
            action: "user-credential.rotate",
            profileId,
            revisionId,
            routeReleaseId,
          }),
        },
      });
    });
    await this.validatePendingRevision(actor, revisionId, routeReleaseId);
    return this.requireProfile(actor.userId, profileId);
  }

  async revoke(serviceKey: string, actor: ModelUserActor, profileId: string) {
    this.requireUserService(serviceKey, actor);
    profileId = uuid(profileId, "BYOK_PROFILE_INVALID");
    const profile = await this.database.credentialProfile.findFirst({
      where: {
        id: profileId,
        ownerKind: CredentialOwnerKind.USER,
        ownerUserId: actor.userId,
      },
      include: { currentRevision: true },
    });
    if (!profile) throw new NotFoundException("BYOK_PROFILE_NOT_FOUND");
    if (profile.status === CredentialStatus.REVOKED) {
      return this.requireProfile(actor.userId, profileId);
    }
    const now = new Date();
    const actionDigest = digest({
      action: "user-credential.revoke",
      profileId,
      revisionId: profile.currentRevisionId,
    });
    await this.database.$transaction(async (transaction) => {
      await transaction.credentialProfile.update({
        where: { id: profileId },
        data: { status: CredentialStatus.REVOKED },
      });
      if (profile.currentRevision) {
        await transaction.credentialRevision.update({
          where: { id: profile.currentRevision.id },
          data: { status: CredentialStatus.REVOKED, revokedAt: now },
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
          reason: "USER_REVOKED_BYOK",
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await this.audit(transaction, actor, {
        action: "user-credential.revoked",
        profileId,
        revisionId: profile.currentRevisionId,
        actionDigest,
      });
    });
    return this.requireProfile(actor.userId, profileId);
  }

  private async validatePendingRevision(
    actor: ModelUserActor,
    revisionId: string,
    routeReleaseId: string,
  ): Promise<void> {
    const [revision, route] = await Promise.all([
      this.database.credentialRevision.findUnique({
        where: { id: revisionId },
        include: { profile: true },
      }),
      this.database.providerRouteRelease.findUnique({
        where: { id: routeReleaseId },
      }),
    ]);
    if (
      !revision ||
      revision.profile.ownerKind !== CredentialOwnerKind.USER ||
      revision.profile.ownerUserId !== actor.userId
    ) {
      throw new NotFoundException("BYOK_REVISION_NOT_FOUND");
    }
    if (revision.status === CredentialStatus.VERIFIED) return;
    if (revision.status !== CredentialStatus.PENDING) {
      throw new ConflictException("BYOK_REVISION_NOT_VALIDATABLE");
    }
    if (
      !route ||
      route.status !== ImmutableReleaseStatus.PUBLISHED ||
      route.providerKey !== revision.profile.providerKey
    ) {
      throw new ConflictException("BYOK_VALIDATION_ROUTE_INVALID");
    }
    if (revision.expiresAt && revision.expiresAt <= new Date()) {
      throw new ConflictException("BYOK_REVISION_EXPIRED");
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
          ModelCredentialValidationKind.USER_CREDENTIAL,
          revision.id,
        ),
      });
    } catch (error) {
      const errorClass = stableErrorClass(error);
      await this.database.securityAuditEvent.create({
        data: auditData(
          actor,
          {
            action: "user-credential.validation-failed",
            profileId: revision.profileId,
            revisionId: revision.id,
            actionDigest: digest({
              action: "user-credential.validate",
              revisionId: revision.id,
              routeReleaseId,
            }),
            metadata: {
              providerKey: route.providerKey,
              errorClass,
              latencyMs: Date.now() - startedAt,
            },
          },
          SecurityAuditResult.FAILED,
        ),
      });
      throw new UnprocessableEntityException(
        `BYOK_VALIDATION_FAILED:${errorClass}`,
      );
    }
    const actionDigest = digest({
      action: "user-credential.validate",
      revisionId: revision.id,
      routeReleaseId,
    });
    await this.database.$transaction(async (transaction) => {
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
      await transaction.credentialRevision.update({
        where: { id: revision.id },
        data: { status: CredentialStatus.VERIFIED, validatedAt: new Date() },
      });
      await transaction.credentialProfile.update({
        where: { id: revision.profileId },
        data: {
          status: CredentialStatus.VERIFIED,
          currentRevisionId: revision.id,
        },
      });
      await transaction.credentialSecurityEvent.create({
        data: {
          profileId: revision.profileId,
          credentialRevisionId: revision.id,
          kind: CredentialSecurityEventKind.VALIDATED,
          reason: "USER_VALIDATED_BYOK",
          actorRef: actor.userId,
          actionDigest,
        },
      });
      await this.audit(transaction, actor, {
        action: "user-credential.validated",
        profileId: revision.profileId,
        revisionId: revision.id,
        actionDigest,
        metadata: {
          providerKey: route.providerKey,
          routeReleaseId,
          latencyMs: Date.now() - startedAt,
        },
      });
    });
  }

  private async requireValidationRoute(
    routeReleaseId: string,
    providerKey: string,
  ) {
    const route = await this.database.providerRouteRelease.findFirst({
      where: {
        id: routeReleaseId,
        providerKey,
        status: ImmutableReleaseStatus.PUBLISHED,
      },
    });
    if (!route) throw new ConflictException("BYOK_VALIDATION_ROUTE_INVALID");
    return route;
  }

  private requireProfile(userId: string, profileId: string) {
    return this.database.credentialProfile.findFirstOrThrow({
      where: {
        id: profileId,
        ownerKind: CredentialOwnerKind.USER,
        ownerUserId: userId,
      },
      select: userCredentialProjection,
    });
  }

  private requireUserService(serviceKey: string, actor: ModelUserActor): void {
    if (serviceKey !== USER_CREDENTIAL_SERVICE) {
      throw new ForbiddenException("USER_CREDENTIAL_SERVICE_FORBIDDEN");
    }
    uuid(actor.userId, "BYOK_ACTOR_USER_INVALID");
    uuid(actor.sessionId, "BYOK_ACTOR_SESSION_INVALID");
  }

  private async audit(
    transaction: SylisTransaction,
    actor: ModelUserActor,
    input: CredentialAuditInput,
  ): Promise<void> {
    await transaction.securityAuditEvent.createMany({
      data: auditData(actor, input),
    });
  }
}

const userCredentialProjection = {
  id: true,
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
      maskedHint: true,
      metadata: true,
      validatedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { revisionNo: "desc" as const },
  },
} as const;

interface CredentialAuditInput {
  action: string;
  profileId: string;
  revisionId?: string | null;
  actionDigest: string;
  metadata?: Record<string, unknown>;
}

function auditData(
  actor: ModelUserActor,
  input: CredentialAuditInput,
  result: SecurityAuditResult = SecurityAuditResult.SUCCEEDED,
) {
  return {
    actorUserId: actor.userId,
    sessionId: actor.sessionId,
    category: SecurityAuditCategory.MODEL,
    action: input.action,
    targetType: "CredentialProfile",
    targetId: input.profileId,
    targetRevisionId: input.revisionId ?? null,
    actionDigest: input.actionDigest,
    result,
    metadata: (input.metadata ?? {}) as PrismaTypes.InputJsonValue,
  };
}

function stableErrorClass(error: unknown): string {
  if (error instanceof ProviderError) return error.code;
  return error instanceof Error ? error.name : "UNKNOWN";
}

function assertReplay(
  revision: {
    profileId: string;
    credentialType: CredentialType;
    fingerprint: string;
    metadata: unknown;
    expiresAt: Date | null;
    profile: {
      ownerKind: CredentialOwnerKind;
      ownerUserId: string | null;
      providerKey: string;
      label: string;
    };
  },
  expected: {
    actorUserId: string;
    providerKey: string;
    label: string;
    credentialType: CredentialType;
    fingerprint: string;
    metadata: Record<string, unknown>;
    expiresAt: Date | null;
  },
): void {
  if (
    revision.profile.ownerKind !== CredentialOwnerKind.USER ||
    revision.profile.ownerUserId !== expected.actorUserId ||
    revision.profile.providerKey !== expected.providerKey ||
    revision.profile.label !== expected.label ||
    revision.credentialType !== expected.credentialType ||
    revision.fingerprint !== expected.fingerprint ||
    canonicalJson(revision.metadata) !== canonicalJson(expected.metadata) ||
    revision.expiresAt?.getTime() !== expected.expiresAt?.getTime()
  ) {
    throw new ConflictException("BYOK_IDEMPOTENCY_CONFLICT");
  }
}

function credentialType(value: unknown): CredentialType {
  if (Object.values(CredentialType).includes(value as CredentialType)) {
    return value as CredentialType;
  }
  throw new BadRequestException("BYOK_CREDENTIAL_TYPE_INVALID");
}

function optionalFutureDate(value: string | undefined): Date | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed <= new Date()) {
    throw new BadRequestException("BYOK_EXPIRY_INVALID");
  }
  return parsed;
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("BYOK_METADATA_INVALID");
  }
  const metadata = value as Record<string, unknown>;
  const serialized = canonicalJson(metadata);
  if (serialized.length > 8_000) {
    throw new BadRequestException("BYOK_METADATA_TOO_LARGE");
  }
  for (const key of Object.keys(metadata)) {
    if (/secret|token|password|api.?key|authorization/i.test(key)) {
      throw new BadRequestException("BYOK_METADATA_SECRET_FORBIDDEN");
    }
  }
  return metadata;
}

function secret(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 16_384) {
    throw new BadRequestException("BYOK_SECRET_INVALID");
  }
  return value;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/.test(value)) {
    throw new BadRequestException(code);
  }
  return value;
}

function text(value: unknown, code: string, max: number): string {
  if (typeof value !== "string") throw new BadRequestException(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new BadRequestException(code);
  }
  return normalized;
}

function requestKey(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 200) {
    throw new BadRequestException("BYOK_IDEMPOTENCY_KEY_INVALID");
  }
  return value;
}

function uuid(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(code);
  }
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
