import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type PrismaTypes, type SylisDatabase } from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import { JobsService } from "../../jobs";
import type {
  CreateGrammarDiagnosisDto,
  CreateReadingGenerationDto,
  CreateTutorMessageDto,
  CreateTutorSessionDto,
} from "../dto/ai-tutor.dto";

const hashInput = (value: unknown): string =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

@Injectable()
export class AiTutorService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: FieldEncryptionService,
    private readonly jobs: JobsService,
  ) {}

  sessions(actor: ActorContext) {
    return this.database.tutorSession.findMany({
      where: { userId: actor.userId },
      include: { _count: { select: { messages: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  createSession(actor: ActorContext, input: CreateTutorSessionDto) {
    return this.database.tutorSession.create({
      data: { userId: actor.userId, title: input.title },
    });
  }

  async messages(actor: ActorContext, sessionId: string) {
    await this.requireSession(actor, sessionId);
    const messages = await this.database.tutorMessage.findMany({
      where: { sessionId },
      include: {
        currentRevision: true,
        contextRefs: true,
        job: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return messages.map((message) => ({
      id: message.id,
      role: message.role,
      createdAt: message.createdAt,
      contextRefs: message.contextRefs,
      job: message.job,
      content: message.currentRevision
        ? this.encryption.decrypt(
            {
              ciphertext: message.currentRevision.contentCiphertext,
              keyVersion: message.currentRevision.keyVersion,
            },
            `tutor-message:${message.id}:1`,
          )
        : null,
    }));
  }

  async createMessage(
    actor: ActorContext,
    sessionId: string,
    input: CreateTutorMessageDto,
    idempotencyKey: string,
  ) {
    await this.requireSession(actor, sessionId);
    await this.requireConsent(actor.userId, input.consentRecordId, "AI_TUTOR");
    return this.database.$transaction(async (transaction) => {
      const assistantMessageId = randomUUID();
      const job = await this.jobs.create(transaction, {
        kind: "TUTOR_RESPONSE",
        requestRefId: assistantMessageId,
        inputHash: hashInput({
          sessionId,
          content: input.content,
          contextRefs: input.contextRefs,
        }),
        idempotencyKey,
        requestedByUserId: actor.userId,
        subjectUserId: actor.userId,
        audience: "USER",
      });
      const existing = await transaction.tutorMessage.findUnique({
        where: { jobId: job.id },
      });
      if (existing) return { jobId: job.id, messageId: existing.id };
      const userMessageId = randomUUID();
      const userEnvelope = this.encryption.encrypt(
        input.content,
        `tutor-message:${userMessageId}:1`,
      );
      const userRevisionId = randomUUID();
      await transaction.tutorMessage.create({
        data: {
          id: userMessageId,
          sessionId,
          role: "USER",
          contextRefs: { create: input.contextRefs },
        },
      });
      await transaction.tutorMessageRevision.create({
        data: {
          id: userRevisionId,
          messageId: userMessageId,
          revisionNo: 1,
          contentCiphertext: userEnvelope.ciphertext,
          keyVersion: userEnvelope.keyVersion,
          contentHash: hashInput(input.content),
        },
      });
      await transaction.tutorMessage.update({
        where: { id: userMessageId },
        data: { currentRevisionId: userRevisionId },
      });
      await transaction.tutorMessage.create({
        data: {
          id: job.requestRefId,
          sessionId,
          role: "ASSISTANT",
          jobId: job.id,
        },
      });
      return { jobId: job.id, messageId: job.requestRefId };
    });
  }

  async createGrammarDiagnosis(
    actor: ActorContext,
    input: CreateGrammarDiagnosisDto,
    idempotencyKey: string,
  ) {
    await this.requireConsent(
      actor.userId,
      input.consentRecordId,
      "AI_GRAMMAR",
    );
    return this.database.$transaction(async (transaction) => {
      const job = await this.jobs.create(transaction, {
        kind: "GRAMMAR_DIAGNOSIS",
        requestRefId: randomUUID(),
        inputHash: hashInput({
          text: input.text,
          languageTag: input.languageTag,
        }),
        idempotencyKey,
        requestedByUserId: actor.userId,
        subjectUserId: actor.userId,
        audience: "USER",
      });
      const existing = await transaction.grammarDiagnosis.findUnique({
        where: { jobId: job.id },
      });
      if (existing) return { diagnosisId: existing.id, jobId: job.id };
      const encrypted = this.encryption.encrypt(
        input.text,
        `grammar-diagnosis:${job.requestRefId}:input`,
      );
      await transaction.grammarDiagnosis.create({
        data: {
          id: job.requestRefId,
          userId: actor.userId,
          jobId: job.id,
          inputCiphertext: encrypted.ciphertext,
          keyVersion: encrypted.keyVersion,
          languageTag: input.languageTag,
        },
      });
      return { diagnosisId: job.requestRefId, jobId: job.id };
    });
  }

  async grammarDiagnosis(actor: ActorContext, diagnosisId: string) {
    const diagnosis = await this.database.grammarDiagnosis.findFirst({
      where: { id: diagnosisId, userId: actor.userId },
      include: { job: { select: { id: true, status: true, errorCode: true } } },
    });
    if (!diagnosis) throw new NotFoundException();
    return {
      id: diagnosis.id,
      languageTag: diagnosis.languageTag,
      job: diagnosis.job,
      result: diagnosis.outputCiphertext
        ? JSON.parse(
            this.encryption.decrypt(
              {
                ciphertext: diagnosis.outputCiphertext,
                keyVersion: diagnosis.keyVersion,
              },
              `grammar-diagnosis:${diagnosis.id}:output`,
            ),
          )
        : null,
    };
  }

  async createReadingGeneration(
    actor: ActorContext,
    input: CreateReadingGenerationDto,
    idempotencyKey: string,
  ) {
    await this.requireConsent(
      actor.userId,
      input.consentRecordId,
      "AI_READING",
    );
    return this.database.$transaction(async (transaction) => {
      const job = await this.jobs.create(transaction, {
        kind: "READING_GENERATION",
        requestRefId: randomUUID(),
        inputHash: hashInput({
          difficulty: input.difficulty,
          constraints: input.constraints,
        }),
        idempotencyKey,
        requestedByUserId: actor.userId,
        subjectUserId: actor.userId,
        audience: "USER",
      });
      const existing = await transaction.readingGeneration.findUnique({
        where: { jobId: job.id },
      });
      if (existing) {
        return {
          generationId: existing.id,
          documentId: existing.documentId,
          jobId: job.id,
        };
      }
      const document = await transaction.readingDocument.create({
        data: { ownerUserId: actor.userId, sourceKind: "AI", status: "DRAFT" },
      });
      await transaction.readingGeneration.create({
        data: {
          id: job.requestRefId,
          userId: actor.userId,
          jobId: job.id,
          documentId: document.id,
          requestedDifficulty: input.difficulty,
          constraints: (input.constraints ?? {}) as PrismaTypes.InputJsonValue,
        },
      });
      return {
        generationId: job.requestRefId,
        documentId: document.id,
        jobId: job.id,
      };
    });
  }

  aiReading(actor: ActorContext) {
    return this.database.readingGeneration.findMany({
      where: { userId: actor.userId, resultRevisionId: { not: null } },
      include: {
        document: {
          select: {
            id: true,
            status: true,
            currentRevision: {
              select: { id: true, title: true, wordCount: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async usage(actor: ActorContext) {
    const aggregate = await this.database.aIUsageLedger.groupBy({
      by: ["capability"],
      where: { userId: actor.userId },
      _sum: { units: true, costMicros: true },
    });
    return aggregate;
  }

  private async requireSession(actor: ActorContext, sessionId: string) {
    const session = await this.database.tutorSession.findFirst({
      where: { id: sessionId, userId: actor.userId },
    });
    if (!session) throw new NotFoundException();
    return session;
  }

  private async requireConsent(
    userId: string,
    consentRecordId: string,
    purpose: string,
  ) {
    const consent = await this.database.consentRecord.findFirst({
      where: { userId, purpose },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    });
    if (consent?.id !== consentRecordId || consent.decision !== "GRANTED") {
      throw new ForbiddenException("AI consent is required");
    }
  }
}
