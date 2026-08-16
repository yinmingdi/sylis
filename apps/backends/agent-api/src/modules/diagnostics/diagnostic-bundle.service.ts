import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AgentMessageVisibility,
  DiagnosticBundleRevisionStatus,
  DiagnosticReferenceKind,
  OperatorRole,
  Prisma,
  SecurityAuditResult,
  SupportResourceKind,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash, randomUUID } from "node:crypto";

import { ModelGatewayClient } from "../../adapters/model-gateway.client";
import { AGENT_DATABASE } from "../../platform/database/database.module";

const REDACTION_POLICY_VERSION = "diagnostic-redaction/1";
const PAYLOAD_SCHEMA_VERSION = "diagnostic-bundle/1";

enum DiagnosticOperation {
  CREATE = "CREATE_DIAGNOSTIC_BUNDLE",
  REVISE = "REVISE_DIAGNOSTIC_BUNDLE",
}

export interface SelectedDiagnosticReference {
  kind: DiagnosticReferenceKind;
  id: string;
}

@Injectable()
export class DiagnosticBundleService {
  constructor(
    @Inject(AGENT_DATABASE) private readonly database: SylisDatabase,
    private readonly gateway: ModelGatewayClient,
  ) {}

  list(userId: string) {
    return this.database.diagnosticBundle.findMany({
      where: { ownerUserId: userId },
      include: { currentRevision: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async bundle(userId: string, bundleId: string) {
    const bundle = await this.database.diagnosticBundle.findFirst({
      where: { id: bundleId, ownerUserId: userId },
      include: { revisions: { orderBy: { revisionNo: "desc" } } },
    });
    if (!bundle) throw new NotFoundException("DIAGNOSTIC_BUNDLE_NOT_FOUND");
    return bundle;
  }

  async create(
    userId: string,
    input: {
      selectedRefs: readonly SelectedDiagnosticReference[];
      idempotencyKey: string;
    },
  ) {
    const refs = selectedReferences(input.selectedRefs);
    const idempotencyKey = requestKey(input.idempotencyKey);
    const requestHash = digest({ selectedRefs: refs });
    const existing = await this.idempotentResponse(
      userId,
      DiagnosticOperation.CREATE,
      idempotencyKey,
      requestHash,
    );
    if (existing) return this.bundle(userId, existing);
    const redactedPayload = await this.buildPayload(userId, refs);
    const contentHash = digest(redactedPayload);
    const bundleId = randomUUID();
    const revisionId = randomUUID();
    await this.database.$transaction(async (transaction) => {
      await transaction.diagnosticBundle.create({
        data: {
          id: bundleId,
          ownerUserId: userId,
          redactionPolicyVersion: REDACTION_POLICY_VERSION,
        },
      });
      await transaction.diagnosticBundleRevision.create({
        data: {
          id: revisionId,
          bundleId,
          revisionNo: 1,
          selectedRefs: refs as unknown as PrismaTypes.InputJsonValue,
          redactedPayload: redactedPayload as PrismaTypes.InputJsonValue,
          contentHash,
          status: DiagnosticBundleRevisionStatus.DRAFT,
        },
      });
      await transaction.diagnosticBundle.update({
        where: { id: bundleId },
        data: { currentRevisionId: revisionId },
      });
      await this.recordIdempotency(
        transaction,
        userId,
        DiagnosticOperation.CREATE,
        idempotencyKey,
        requestHash,
        bundleId,
      );
    });
    return this.bundle(userId, bundleId);
  }

  async revise(
    userId: string,
    bundleId: string,
    input: {
      selectedRefs?: readonly SelectedDiagnosticReference[];
      redactedPayload?: unknown;
      idempotencyKey: string;
    },
  ) {
    if (
      input.selectedRefs === undefined &&
      input.redactedPayload === undefined
    ) {
      throw new BadRequestException("DIAGNOSTIC_REVISION_CHANGE_REQUIRED");
    }
    const bundle = await this.bundle(userId, bundleId);
    const current = bundle.revisions[0];
    if (!current)
      throw new ConflictException("DIAGNOSTIC_CURRENT_REVISION_REQUIRED");
    const refs = input.selectedRefs
      ? selectedReferences(input.selectedRefs)
      : selectedReferences(current.selectedRefs);
    const payload = input.redactedPayload
      ? editedPayload(input.redactedPayload, refs)
      : await this.buildPayload(userId, refs);
    const idempotencyKey = requestKey(input.idempotencyKey);
    const requestHash = digest({ bundleId, refs, payload });
    const existing = await this.idempotentResponse(
      userId,
      DiagnosticOperation.REVISE,
      idempotencyKey,
      requestHash,
    );
    if (existing) {
      const revision = bundle.revisions.find(
        (candidate) => candidate.id === existing,
      );
      if (!revision)
        throw new ConflictException("DIAGNOSTIC_IDEMPOTENCY_SCOPE_INVALID");
      return revision;
    }
    const contentHash = digest(payload);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "DiagnosticBundle" WHERE id = ${bundleId}::uuid FOR UPDATE`,
      );
      const revision = await transaction.diagnosticBundleRevision.create({
        data: {
          bundleId,
          revisionNo:
            (await transaction.diagnosticBundleRevision.count({
              where: { bundleId },
            })) + 1,
          selectedRefs: refs as unknown as PrismaTypes.InputJsonValue,
          redactedPayload: payload as PrismaTypes.InputJsonValue,
          contentHash,
          status: DiagnosticBundleRevisionStatus.DRAFT,
        },
      });
      await transaction.diagnosticBundle.update({
        where: { id: bundleId },
        data: { currentRevisionId: revision.id },
      });
      await this.recordIdempotency(
        transaction,
        userId,
        DiagnosticOperation.REVISE,
        idempotencyKey,
        requestHash,
        revision.id,
      );
      return revision;
    });
  }

  async confirm(userId: string, bundleId: string, revisionId: string) {
    return this.database.$transaction(async (transaction) => {
      const [bundle] = await transaction.$queryRaw<
        { currentRevisionId: string | null }[]
      >(Prisma.sql`
        SELECT "currentRevisionId"
        FROM "DiagnosticBundle"
        WHERE id = ${bundleId}::uuid AND "ownerUserId" = ${userId}::uuid
        FOR UPDATE
      `);
      if (!bundle) throw new NotFoundException("DIAGNOSTIC_BUNDLE_NOT_FOUND");

      const revision = await transaction.diagnosticBundleRevision.findFirst({
        where: { id: revisionId, bundleId },
      });
      if (!revision)
        throw new NotFoundException("DIAGNOSTIC_REVISION_NOT_FOUND");
      if (revision.status === DiagnosticBundleRevisionStatus.CONFIRMED) {
        return revision;
      }

      const existing = await transaction.diagnosticBundleRevision.findUnique({
        where: { confirmedFromRevisionId: revision.id },
      });
      if (existing) {
        return existing;
      }
      if (bundle.currentRevisionId !== revision.id) {
        throw new ConflictException("DIAGNOSTIC_REVISION_NOT_CURRENT");
      }

      const confirmedAt = new Date();
      const confirmed = await transaction.diagnosticBundleRevision.create({
        data: {
          bundleId,
          revisionNo:
            (await transaction.diagnosticBundleRevision.count({
              where: { bundleId },
            })) + 1,
          selectedRefs: revision.selectedRefs as PrismaTypes.InputJsonValue,
          redactedPayload:
            revision.redactedPayload as PrismaTypes.InputJsonValue,
          contentHash: revision.contentHash,
          status: DiagnosticBundleRevisionStatus.CONFIRMED,
          confirmedFromRevisionId: revision.id,
          confirmedAt,
          createdAt: confirmedAt,
        },
      });
      await transaction.diagnosticBundle.update({
        where: { id: bundleId },
        data: { currentRevisionId: confirmed.id },
      });
      return confirmed;
    });
  }

  async supportRead(
    serviceKey: string,
    input: {
      grantId: string;
      requestId: string;
      operatorUserId: string;
      ownerUserId: string;
      bundleId: string;
      revisionId: string;
    },
  ) {
    if (serviceKey !== "api")
      throw new ConflictException("IDENTITY_API_REQUIRED");
    const requestId = supportAccessRequestId(input.requestId);
    return this.database.$transaction(async (transaction) => {
      const now = new Date();
      const grant = await transaction.supportGrant.findFirst({
        where: {
          id: input.grantId,
          userId: input.ownerUserId,
          supportUserId: input.operatorUserId,
          resourceKind: SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION,
          resourceId: input.bundleId,
          resourceRevisionId: input.revisionId,
          revokedAt: null,
          expiresAt: { gt: now },
          operator: {
            roles: {
              some: {
                role: OperatorRole.SUPPORT,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
        },
      });
      if (!grant) throw new NotFoundException("SUPPORT_GRANT_NOT_FOUND");
      const revision = await transaction.diagnosticBundleRevision.findFirst({
        where: {
          id: input.revisionId,
          bundleId: input.bundleId,
          bundle: { ownerUserId: input.ownerUserId },
          status: DiagnosticBundleRevisionStatus.CONFIRMED,
        },
        select: {
          id: true,
          bundleId: true,
          revisionNo: true,
          contentHash: true,
          redactedPayload: true,
          confirmedAt: true,
        },
      });
      if (!revision)
        throw new NotFoundException("CONFIRMED_DIAGNOSTIC_REVISION_NOT_FOUND");
      await transaction.dataAccessAuditEvent.createMany({
        data: [
          {
            actorUserId: input.operatorUserId,
            ownerUserId: input.ownerUserId,
            supportGrantId: grant.id,
            purpose: grant.purpose,
            resourceKind: grant.resourceKind,
            resourceId: grant.resourceId,
            resourceRevisionId: grant.resourceRevisionId,
            result: SecurityAuditResult.SUCCEEDED,
            requestId,
          },
        ],
      });
      return revision;
    });
  }

  private async buildPayload(
    userId: string,
    refs: readonly SelectedDiagnosticReference[],
  ) {
    const resources = [];
    for (const ref of refs)
      resources.push(await this.buildResource(userId, ref));
    return redactValue({
      schemaVersion: PAYLOAD_SCHEMA_VERSION,
      resources,
    });
  }

  private async buildResource(
    userId: string,
    ref: SelectedDiagnosticReference,
  ) {
    switch (ref.kind) {
      case DiagnosticReferenceKind.AGENT_MESSAGE: {
        const message = await this.database.agentMessage.findFirst({
          where: {
            id: ref.id,
            visibility: AgentMessageVisibility.USER,
            session: { userId },
          },
          include: {
            blocks: {
              orderBy: { position: "asc" },
              include: {
                content: true,
                table: {
                  include: {
                    rows: {
                      orderBy: { position: "asc" },
                      include: { cells: { orderBy: { position: "asc" } } },
                    },
                  },
                },
              },
            },
          },
        });
        if (!message)
          throw new NotFoundException("DIAGNOSTIC_MESSAGE_NOT_FOUND");
        const bodyIds = message.blocks.flatMap((block) => [
          ...(block.content?.contentBodyId
            ? [block.content.contentBodyId]
            : []),
          ...(block.table?.rows.flatMap((row) =>
            row.cells.map((cell) => cell.contentBodyId),
          ) ?? []),
        ]);
        const bodies = await Promise.all(
          bodyIds.map((id) => this.gateway.readContent(id, userId)),
        );
        return {
          kind: ref.kind,
          id: ref.id,
          metadata: {
            role: message.role,
            sequence: message.sequence,
            createdAt: message.createdAt.toISOString(),
            contentHashes: bodies.map(({ contentHash }) => contentHash),
          },
          content: bodies.map(({ plaintext }) => plaintext).join("\n\n"),
        };
      }
      case DiagnosticReferenceKind.AGENT_RUN: {
        const run = await this.database.agentRun.findFirst({
          where: { id: ref.id, session: { userId } },
          include: {
            capabilityRelease: {
              select: { capabilityKey: true, version: true },
            },
          },
        });
        if (!run) throw new NotFoundException("DIAGNOSTIC_RUN_NOT_FOUND");
        const job = await this.database.job.findFirst({
          where: { ownerId: run.id },
          select: {
            status: true,
            errorCode: true,
            createdAt: true,
            completedAt: true,
          },
        });
        return {
          kind: ref.kind,
          id: ref.id,
          metadata: {
            status: run.status,
            capability: run.capabilityRelease.capabilityKey,
            capabilityVersion: run.capabilityRelease.version,
            queuedAt: run.queuedAt.toISOString(),
            startedAt: run.startedAt?.toISOString() ?? null,
            completedAt: run.completedAt?.toISOString() ?? null,
            job,
          },
        };
      }
      case DiagnosticReferenceKind.AGENT_EVENT: {
        const event = await this.database.agentEvent.findFirst({
          where: { id: ref.id, session: { userId } },
        });
        if (!event) throw new NotFoundException("DIAGNOSTIC_EVENT_NOT_FOUND");
        return {
          kind: ref.kind,
          id: ref.id,
          metadata: {
            type: event.type,
            sequence: event.sequence,
            occurredAt: event.occurredAt.toISOString(),
            safePayload: event.safePayload,
          },
        };
      }
      case DiagnosticReferenceKind.AGENT_ARTIFACT_REVISION: {
        const revision = await this.database.agentArtifactRevision.findFirst({
          where: { id: ref.id, artifact: { ownerUserId: userId } },
          include: { artifact: { select: { kind: true, title: true } } },
        });
        if (!revision)
          throw new NotFoundException("DIAGNOSTIC_ARTIFACT_NOT_FOUND");
        const content = revision.contentBodyId
          ? await this.gateway.readContent(revision.contentBodyId, userId)
          : null;
        return {
          kind: ref.kind,
          id: ref.id,
          metadata: {
            artifactKind: revision.artifact.kind,
            title: revision.artifact.title,
            revisionNo: revision.revisionNo,
            contentHash: revision.contentHash,
          },
          ...(content ? { content: content.plaintext } : {}),
        };
      }
      case DiagnosticReferenceKind.CONTENT_ASSET_REVISION: {
        const revision = await this.database.contentAssetRevision.findFirst({
          where: { id: ref.id, asset: { ownerUserId: userId } },
        });
        if (!revision)
          throw new NotFoundException("DIAGNOSTIC_ASSET_NOT_FOUND");
        return {
          kind: ref.kind,
          id: ref.id,
          metadata: {
            filename: revision.filename,
            mimeType: revision.detectedMimeType ?? revision.declaredMimeType,
            byteSize: revision.byteSize.toString(),
            contentHash: revision.contentHash,
            status: revision.status,
            scannerVersion: revision.scannerVersion,
            parserVersion: revision.parserVersion,
          },
        };
      }
    }
  }

  private async idempotentResponse(
    actorId: string,
    operation: DiagnosticOperation,
    key: string,
    requestHash: string,
  ): Promise<string | undefined> {
    const record = await this.database.idempotencyRecord.findUnique({
      where: { actorId_operation_key: { actorId, operation, key } },
    });
    if (!record) return undefined;
    if (record.requestHash !== requestHash) {
      throw new ConflictException("DIAGNOSTIC_IDEMPOTENCY_CONFLICT");
    }
    return record.responseRef;
  }

  private recordIdempotency(
    transaction: PrismaTypes.TransactionClient,
    actorId: string,
    operation: DiagnosticOperation,
    key: string,
    requestHash: string,
    responseRef: string,
  ) {
    return transaction.idempotencyRecord.create({
      data: {
        actorId,
        operation,
        key,
        requestHash,
        responseRef,
        statusCode: 201,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      },
    });
  }
}

function selectedReferences(value: unknown): SelectedDiagnosticReference[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new BadRequestException("DIAGNOSTIC_REFERENCES_INVALID");
  }
  const refs = value.map((entry) => {
    if (
      !isRecord(entry) ||
      !Object.values(DiagnosticReferenceKind).includes(
        entry.kind as DiagnosticReferenceKind,
      ) ||
      typeof entry.id !== "string" ||
      !isUuid(entry.id)
    ) {
      throw new BadRequestException("DIAGNOSTIC_REFERENCE_INVALID");
    }
    return { kind: entry.kind as DiagnosticReferenceKind, id: entry.id };
  });
  if (
    new Set(refs.map((ref) => `${ref.kind}:${ref.id}`)).size !== refs.length
  ) {
    throw new BadRequestException("DIAGNOSTIC_REFERENCE_DUPLICATE");
  }
  return refs;
}

function editedPayload(
  value: unknown,
  refs: readonly SelectedDiagnosticReference[],
): unknown {
  if (!isRecord(value) || !Array.isArray(value.resources)) {
    throw new BadRequestException("DIAGNOSTIC_PAYLOAD_INVALID");
  }
  const allowed = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
  const seen = new Set<string>();
  for (const resource of value.resources) {
    if (
      !isRecord(resource) ||
      typeof resource.kind !== "string" ||
      typeof resource.id !== "string"
    ) {
      throw new BadRequestException("DIAGNOSTIC_PAYLOAD_RESOURCE_INVALID");
    }
    const key = `${resource.kind}:${resource.id}`;
    if (!allowed.has(key) || seen.has(key)) {
      throw new BadRequestException(
        "DIAGNOSTIC_PAYLOAD_REFERENCE_SCOPE_INVALID",
      );
    }
    seen.add(key);
  }
  const redacted = redactValue({
    ...value,
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
  });
  if (canonicalJson(redacted).length > 256_000) {
    throw new BadRequestException("DIAGNOSTIC_PAYLOAD_SIZE_LIMIT");
  }
  return redacted;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[REDACTED:DEPTH_LIMIT]";
  if (typeof value === "string") return redactText(value).slice(0, 20_000);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value.slice(0, 200).map((entry) => redactValue(entry, depth + 1));
  if (!isRecord(value)) return "[REDACTED:UNSUPPORTED_VALUE]";
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    if (isDeniedKey(key)) {
      output[key] = "[REDACTED:SENSITIVE_FIELD]";
    } else {
      output[key] = redactValue(entry, depth + 1);
    }
  }
  return output;
}

function redactText(value: string): string {
  return value
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+\u002f-]+=*/gi,
      "[REDACTED:AUTHORIZATION]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED:API_KEY]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED:JWT]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED:EMAIL]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED:IP]");
}

function isDeniedKey(value: string): boolean {
  return /authorization|cookie|password|secret|token|credential|ciphertext|nonce|authTag|encryptedDek|systemPrompt|reasoning|chainOfThought|providerRaw/i.test(
    value,
  );
}

function requestKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(normalized)) {
    throw new BadRequestException("IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

function supportAccessRequestId(value: string): string {
  const normalized = value.trim();
  if (!/^resource-read:[A-Za-z0-9._:-]{12,160}$/.test(normalized)) {
    throw new BadRequestException("SUPPORT_ACCESS_REQUEST_ID_INVALID");
  }
  return normalized;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
