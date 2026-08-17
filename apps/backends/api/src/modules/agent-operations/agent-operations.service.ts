import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentOwnerCommandKind,
  AgentResourceKind,
  AgentToolKey,
  type AgentArtifactRevisionSnapshot,
  type AgentResourceRef,
} from "@sylis/agent-contracts";
import {
  AgentProposalDecision,
  AgentProposalStatus,
  AgentToolSideEffectClass,
  CollectedLexicalItemRevisionSource,
  PrismaTypes,
  SessionAudience,
  SessionAuthStrength,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

import type { ActorContext } from "../../platform/auth/actor-context";
import { DATABASE } from "../../platform/database/database.module";
import { LexicalTargetKind } from "../lexicon/lexical-target-kind";
import { LexiconQueryService } from "../lexicon/services/lexicon-query.service";
import { NotebooksService } from "../notebooks/services/notebooks.service";
import { ReadingService } from "../reading/services/reading.service";
import { StudyService } from "../study/services/study.service";

enum AgentOwnerOperation {
  COMMIT = "COMMIT_AGENT_OWNER_COMMAND",
}

@Injectable()
export class AgentOperationsService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly lexicon: LexiconQueryService,
    private readonly study: StudyService,
    private readonly reading: ReadingService,
    private readonly notebooks: NotebooksService,
  ) {}

  async executeTool(
    serviceKey: string,
    input: {
      userId: string;
      toolKey: AgentToolKey;
      toolCallId: string;
      actionDigest: string;
      arguments: Readonly<Record<string, unknown>>;
    },
  ): Promise<Readonly<Record<string, unknown>>> {
    requireService(serviceKey, "agent-executor");
    const userId = uuid(input.userId, "userId");
    uuid(input.toolCallId, "toolCallId");
    const toolKey = agentToolKey(input.toolKey);
    const expectedDigest = digest({
      toolKey,
      schemaVersion: schemaVersion(input.arguments),
      input: toolArguments(input.arguments),
    });
    if (expectedDigest !== input.actionDigest) {
      throw new ConflictException("AGENT_TOOL_ACTION_DIGEST_CHANGED");
    }
    const argumentsValue = toolArguments(input.arguments);
    const actor = agentActor(userId);
    switch (toolKey) {
      case AgentToolKey.LEXICON_SEARCH:
        return {
          data: await this.lexicon.searchMany(
            lexicalQueries(argumentsValue.queries),
            optionalInteger(argumentsValue.limitPerQuery, 10, 1, 20),
          ),
        };
      case AgentToolKey.LEXICON_ENTRY_READ:
        return {
          data: await this.lexicon.entry(
            uuid(argumentsValue.entryId, "entryId"),
          ),
        };
      case AgentToolKey.LEARNING_TODAY_READ:
        assertNoKeys(argumentsValue);
        return { data: await this.study.today(actor) };
      case AgentToolKey.READING_DOCUMENT_READ:
        return {
          data: await this.reading.document(
            actor,
            uuid(argumentsValue.documentId, "documentId"),
          ),
        };
      case AgentToolKey.NOTEBOOK_LIST:
        assertNoKeys(argumentsValue);
        return { data: await this.notebooks.list(actor) };
    }
    throw new BadRequestException("AGENT_TOOL_KEY_UNSUPPORTED");
  }

  async contextEvidence(
    serviceKey: string,
    input: { userId: string; ref: AgentResourceRef },
  ): Promise<{ label: string; content: string }> {
    requireService(serviceKey, "agent-api");
    const actor = agentActor(uuid(input.userId, "userId"));
    const ref = resourceRef(input.ref);
    switch (ref.kind) {
      case AgentResourceKind.READING_DOCUMENT_REVISION: {
        if (!ref.revisionId) {
          throw new BadRequestException("AGENT_READING_REVISION_REQUIRED");
        }
        const revision = await this.reading.revision(
          actor,
          ref.id,
          ref.revisionId,
        );
        return {
          label: revision.title,
          content: canonicalJson({
            id: revision.id,
            documentId: revision.documentId,
            languageTag: revision.languageTag,
            title: revision.title,
            content: revision.content,
          }),
        };
      }
      case AgentResourceKind.LEARNING_SUMMARY: {
        const summary = await this.study.planSummary(actor, ref.id);
        return {
          label: `Learning plan ${summary.localDate.toISOString().slice(0, 10)}`,
          content: canonicalJson(summary),
        };
      }
      case AgentResourceKind.NOTEBOOK: {
        const [notebook, items] = await Promise.all([
          this.notebooks.get(actor, ref.id),
          this.notebooks.items(actor, ref.id),
        ]);
        return {
          label: notebook.name,
          content: canonicalJson({
            id: notebook.id,
            name: notebook.name,
            description: notebook.description,
            items,
          }),
        };
      }
      default:
        throw new BadRequestException("AGENT_CONTEXT_EVIDENCE_UNSUPPORTED");
    }
  }

  async commitOwnerCommand(
    serviceKey: string,
    input: {
      userId: string;
      proposalId: string;
      commandKind: AgentOwnerCommandKind;
      target: AgentResourceRef;
      payload: Readonly<Record<string, unknown>>;
      artifact?: AgentArtifactRevisionSnapshot;
      actionDigest: string;
      idempotencyKey: string;
      commitAttemptId: string;
    },
  ) {
    requireService(serviceKey, "agent-api");
    const userId = uuid(input.userId, "userId");
    const proposalId = uuid(input.proposalId, "proposalId");
    const commandKind = ownerCommandKind(input.commandKind);
    const target = resourceRef(input.target);
    const payload = record(input.payload, "payload");
    const expectedDigest = digest({ commandKind, target, input: payload });
    if (expectedDigest !== input.actionDigest) {
      throw new ConflictException("AGENT_OWNER_ACTION_DIGEST_CHANGED");
    }
    const idempotencyKey = requestKey(input.idempotencyKey);
    const requestHash = input.actionDigest;
    const commitAttemptId = uuid(input.commitAttemptId, "commitAttemptId");
    const previous = await this.database.idempotencyRecord.findUnique({
      where: {
        actorId_operation_key: {
          actorId: userId,
          operation: AgentOwnerOperation.COMMIT,
          key: idempotencyKey,
        },
      },
    });
    if (previous) {
      if (
        previous.requestHash !== requestHash ||
        previous.agentProposalId !== proposalId
      ) {
        throw new ConflictException("AGENT_OWNER_IDEMPOTENCY_CONFLICT");
      }
      return this.ownerCommandReplay(
        userId,
        commandKind,
        previous.responseRef,
        previous.id,
      );
    }
    const now = new Date();
    const proposal = await this.database.agentProposal.findFirst({
      where: {
        id: proposalId,
        actionDigest: requestHash,
        status: AgentProposalStatus.COMMITTING,
        decision: AgentProposalDecision.APPROVE,
        decidedByUserId: userId,
        commitAttemptId,
        expiresAt: { gt: now },
        commitLeaseExpiresAt: { gt: now },
        grant: {
          userId,
          actionDigest: requestHash,
          sideEffectClass: AgentToolSideEffectClass.WRITE_PRIVATE_REVERSIBLE,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      },
      select: { id: true },
    });
    if (!proposal) {
      throw new ConflictException("AGENT_OWNER_COMMIT_AUTHORIZATION_INVALID");
    }
    const result = await this.dispatchOwnerCommand(
      agentActor(userId),
      commandKind,
      target,
      payload,
      input.artifact,
    );
    let idempotency: { id: string };
    try {
      idempotency = await this.database.idempotencyRecord.create({
        data: {
          actorId: userId,
          operation: AgentOwnerOperation.COMMIT,
          key: idempotencyKey,
          requestHash,
          responseRef: result.resultId,
          statusCode: 201,
          agentProposalId: proposalId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaTypes.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await this.database.idempotencyRecord.findUnique({
          where: {
            actorId_operation_key: {
              actorId: userId,
              operation: AgentOwnerOperation.COMMIT,
              key: idempotencyKey,
            },
          },
        });
        if (raced) {
          if (
            raced.requestHash !== requestHash ||
            raced.agentProposalId !== proposalId
          ) {
            throw new ConflictException("AGENT_OWNER_IDEMPOTENCY_CONFLICT");
          }
          return this.ownerCommandReplay(
            userId,
            commandKind,
            raced.responseRef,
            raced.id,
          );
        }
      }
      throw error;
    }
    return {
      ...result,
      idempotencyRecordId: idempotency.id,
      replayed: false,
    };
  }

  private async ownerCommandReplay(
    userId: string,
    commandKind: AgentOwnerCommandKind,
    resultId: string,
    idempotencyRecordId: string,
  ) {
    switch (commandKind) {
      case AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD:
        return {
          resultId,
          resourceKind: AgentResourceKind.NOTEBOOK,
          idempotencyRecordId,
          replayed: true,
        };
      case AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH: {
        const revision = await this.database.readingDocumentRevision.findFirst({
          where: { id: resultId, document: { ownerUserId: userId } },
          select: { id: true, documentId: true },
        });
        if (!revision) {
          throw new ConflictException("AGENT_OWNER_REPLAY_RESULT_MISSING");
        }
        return {
          resultId: revision.id,
          resourceKind: AgentResourceKind.READING_DOCUMENT_REVISION,
          documentId: revision.documentId,
          revisionId: revision.id,
          idempotencyRecordId,
          replayed: true,
        };
      }
    }
  }

  private async dispatchOwnerCommand(
    actor: ActorContext,
    commandKind: AgentOwnerCommandKind,
    target: AgentResourceRef,
    payload: Readonly<Record<string, unknown>>,
    artifact?: AgentArtifactRevisionSnapshot,
  ): Promise<{
    resultId: string;
    resourceKind: AgentResourceKind;
    documentId?: string;
    revisionId?: string;
  }> {
    switch (commandKind) {
      case AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD: {
        if (target.kind !== AgentResourceKind.NOTEBOOK || target.revisionId) {
          throw new BadRequestException("AGENT_NOTEBOOK_TARGET_INVALID");
        }
        const lexicalTarget = record(payload.target, "payload.target");
        const kind = requiredText(
          lexicalTarget.kind,
          "payload.target.kind",
          32,
        );
        if (
          !Object.values(LexicalTargetKind).includes(kind as LexicalTargetKind)
        ) {
          throw new BadRequestException("AGENT_LEXICAL_TARGET_KIND_INVALID");
        }
        const item = await this.notebooks.addItem(
          actor,
          target.id,
          {
            target: {
              kind: kind as LexicalTargetKind,
              id: uuid(lexicalTarget.id, "payload.target.id"),
            },
            ...(payload.note === undefined
              ? {}
              : { note: requiredText(payload.note, "payload.note", 2_000) }),
            ...(payload.tags === undefined
              ? {}
              : { tags: stringArray(payload.tags, 20, 80) }),
          },
          CollectedLexicalItemRevisionSource.AGENT,
        );
        return { resultId: item.id, resourceKind: AgentResourceKind.NOTEBOOK };
      }
      case AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH: {
        if (
          target.kind !== AgentResourceKind.AGENT_ARTIFACT_REVISION ||
          !target.revisionId ||
          !target.contentHash ||
          !artifact ||
          artifact.artifactId !== target.id ||
          artifact.revisionId !== target.revisionId ||
          artifact.contentHash !== target.contentHash ||
          artifact.artifactKind !== AgentArtifactKind.ARTICLE ||
          artifact.schemaVersion !== AgentArtifactSchemaVersion.ARTICLE_V1 ||
          artifact.document.artifactKind !== AgentArtifactKind.ARTICLE ||
          artifact.document.schemaVersion !==
            AgentArtifactSchemaVersion.ARTICLE_V1
        ) {
          throw new BadRequestException("AGENT_READING_ARTIFACT_INVALID");
        }
        const title = requiredText(payload.title, "payload.title", 240);
        if (
          artifact.title !== title ||
          digest(artifact.document) !== target.contentHash
        ) {
          throw new ConflictException("AGENT_READING_ARTIFACT_CHANGED");
        }
        const published = await this.reading.publishAgentArticle(
          actor,
          artifact,
        );
        return {
          resultId: published.revisionId,
          resourceKind: AgentResourceKind.READING_DOCUMENT_REVISION,
          documentId: published.documentId,
          revisionId: published.revisionId,
        };
      }
    }
    throw new BadRequestException("AGENT_OWNER_COMMAND_UNSUPPORTED");
  }
}

function agentActor(userId: string): ActorContext {
  return {
    userId,
    sessionId: userId,
    audience: SessionAudience.AGENT,
    roles: [],
    authStrength: SessionAuthStrength.PASSWORD,
  };
}

function requireService(actual: string, expected: string): void {
  if (actual !== expected)
    throw new ForbiddenException("AGENT_SERVICE_REQUIRED");
}

function agentToolKey(value: unknown): AgentToolKey {
  if (Object.values(AgentToolKey).includes(value as AgentToolKey))
    return value as AgentToolKey;
  throw new BadRequestException("AGENT_TOOL_KEY_INVALID");
}

function ownerCommandKind(value: unknown): AgentOwnerCommandKind {
  if (
    Object.values(AgentOwnerCommandKind).includes(
      value as AgentOwnerCommandKind,
    )
  ) {
    return value as AgentOwnerCommandKind;
  }
  throw new BadRequestException("AGENT_OWNER_COMMAND_KIND_INVALID");
}

function resourceRef(value: AgentResourceRef): AgentResourceRef {
  if (
    !Object.values(AgentResourceKind).includes(value.kind) ||
    !isUuid(value.id)
  ) {
    throw new BadRequestException("AGENT_RESOURCE_REF_INVALID");
  }
  if (value.revisionId && !isUuid(value.revisionId)) {
    throw new BadRequestException("AGENT_RESOURCE_REVISION_INVALID");
  }
  if (
    value.contentHash !== undefined &&
    !/^sha256:[a-f0-9]{64}$/.test(value.contentHash)
  ) {
    throw new BadRequestException("AGENT_RESOURCE_CONTENT_HASH_INVALID");
  }
  return value;
}

function schemaVersion(value: Readonly<Record<string, unknown>>): string {
  const version = value.__schemaVersion;
  if (typeof version !== "string")
    throw new BadRequestException("AGENT_TOOL_SCHEMA_VERSION_REQUIRED");
  return version;
}

function toolArguments(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const argumentsValue = { ...value };
  delete argumentsValue.__schemaVersion;
  return argumentsValue;
}

function assertNoKeys(value: Readonly<Record<string, unknown>>): void {
  if (Object.keys(value).length !== 0)
    throw new BadRequestException("AGENT_TOOL_ARGUMENTS_INVALID");
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string")
    throw new BadRequestException(`${field}_INVALID`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return normalized;
}

function optionalInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new BadRequestException("AGENT_TOOL_INTEGER_INVALID");
  }
  return value as number;
}

function stringArray(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new BadRequestException("AGENT_STRING_ARRAY_INVALID");
  }
  return value.map((item) => requiredText(item, "arrayItem", maximumLength));
}

function lexicalQueries(value: unknown): string[] {
  const queries = stringArray(value, 20, 200);
  if (queries.length === 0) {
    throw new BadRequestException("AGENT_LEXICON_QUERIES_INVALID");
  }
  const seen = new Set<string>();
  return queries.filter((query) => {
    const key = query.normalize("NFC").toLocaleLowerCase("en-US");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function record(
  value: unknown,
  field: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requestKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,179}$/.test(normalized)) {
    throw new BadRequestException("IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !isUuid(value)) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
