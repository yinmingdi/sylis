import { Inject, Injectable } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

import { AiGatewayService } from "../../adapters/ai-provider/ai-gateway.service";
import { WORKER_DATABASE } from "../../adapters/database/database.module";
import { ContentEncryptionService } from "../../adapters/encryption/content-encryption.service";
import type { ClaimedWorkerJob } from "../../runtime/job-runtime.service";
import { JobRuntimeService } from "../../runtime/job-runtime.service";
import type { WorkerHandler } from "../../runtime/worker-handler";

interface ReadingResult {
  title: string;
  content: string;
  languageTag: string;
}

@Injectable()
export class ReadingGenerationHandler implements WorkerHandler {
  readonly kind = "READING_GENERATION" as const;

  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: ContentEncryptionService,
    private readonly ai: AiGatewayService,
    private readonly runtime: JobRuntimeService,
  ) {}

  async run(job: ClaimedWorkerJob): Promise<void> {
    const generation = await this.database.readingGeneration.findUnique({
      where: { jobId: job.id },
      include: { document: true },
    });
    if (!generation) throw new Error("READING_GENERATION_REQUEST_MISSING");
    if (generation.resultRevisionId) return;
    const consent = await this.database.consentRecord.findFirst({
      where: { userId: generation.userId, purpose: "AI_READING" },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    });
    if (consent?.decision !== "GRANTED") {
      throw new Error("AI_CONSENT_WITHDRAWN");
    }
    await this.runtime.report(job, {
      stage: "GENERATING",
      processed: 0,
      total: 1,
    });
    const result = await this.ai.structured<ReadingResult>(
      job,
      generation.userId,
      "READING_GENERATION",
      {
        taskType: "READING_GENERATION",
        schemaName: "sylis_reading_generation",
        candidateKey: job.id,
        systemPrompt:
          "Create an original English learning text at the requested difficulty. Do not quote copyrighted source text. Return JSON through the tool only.",
        input: {
          difficulty: generation.requestedDifficulty,
          constraints: generation.constraints,
        },
        maxTokens: 4_096,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["title", "content", "languageTag"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 160 },
            content: { type: "string", minLength: 100, maxLength: 20000 },
            languageTag: { type: "string", const: "en" },
          },
        },
      },
    );
    if (
      typeof result.title !== "string" ||
      typeof result.content !== "string" ||
      result.content.trim().length < 100 ||
      result.languageTag !== "en"
    ) {
      throw new Error("READING_GENERATION_INVALID");
    }
    const revisionId = randomUUID();
    const envelope = this.encryption.encrypt(
      result.content,
      `reading-revision:${revisionId}`,
    );
    const contentHash = `sha256:${createHash("sha256").update(result.content).digest("hex")}`;
    const wordCount = result.content
      .trim()
      .split(/\s+/u)
      .filter(Boolean).length;
    await this.database.$transaction(async (transaction) => {
      await transaction.readingDocumentRevision.create({
        data: {
          id: revisionId,
          documentId: generation.documentId,
          revisionNo: 1,
          languageTag: "en",
          title: result.title,
          contentCiphertext: envelope.ciphertext,
          keyVersion: envelope.keyVersion,
          contentHash,
          wordCount,
          publishedAt: new Date(),
        },
      });
      await transaction.readingDocument.update({
        where: { id: generation.documentId },
        data: { currentRevisionId: revisionId, status: "PUBLISHED" },
      });
      await transaction.readingGeneration.update({
        where: { id: generation.id },
        data: { resultRevisionId: revisionId },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: "ReadingDocument",
          aggregateId: generation.documentId,
          eventType: "reading.revision.published",
          eventVersion: "sylis.reading-revision/1",
          payload: { documentId: generation.documentId, revisionId },
        },
      });
    });
    await this.runtime.report(job, {
      stage: "PUBLISHED",
      processed: 1,
      total: 1,
      message: revisionId,
    });
  }
}
