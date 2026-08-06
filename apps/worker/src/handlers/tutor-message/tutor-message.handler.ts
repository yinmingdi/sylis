import { Inject, Injectable } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

import { AiGatewayService } from "../../adapters/ai-provider/ai-gateway.service";
import { WORKER_DATABASE } from "../../adapters/database/database.module";
import { ContentEncryptionService } from "../../adapters/encryption/content-encryption.service";
import { WorkerConfig } from "../../config/worker-config";
import type { ClaimedWorkerJob } from "../../runtime/job-runtime.service";
import { JobRuntimeService } from "../../runtime/job-runtime.service";
import type { WorkerHandler } from "../../runtime/worker-handler";

@Injectable()
export class TutorMessageHandler implements WorkerHandler {
  readonly kind = "TUTOR_RESPONSE" as const;

  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: ContentEncryptionService,
    private readonly ai: AiGatewayService,
    private readonly runtime: JobRuntimeService,
    private readonly config: WorkerConfig,
  ) {}

  async run(job: ClaimedWorkerJob): Promise<void> {
    const assistant = await this.database.tutorMessage.findUnique({
      where: { jobId: job.id },
      include: { currentRevision: true, session: true },
    });
    if (!assistant) throw new Error("TUTOR_MESSAGE_REQUEST_MISSING");
    if (assistant.currentRevision) return;
    await this.requireConsent(assistant.session.userId, "AI_TUTOR");
    const messages = await this.database.tutorMessage.findMany({
      where: {
        sessionId: assistant.sessionId,
        createdAt: { lte: assistant.createdAt },
      },
      include: { currentRevision: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    const promptMessages = messages
      .reverse()
      .filter((message) => message.currentRevision)
      .map((message) => ({
        role:
          message.role === "ASSISTANT"
            ? ("assistant" as const)
            : ("user" as const),
        content: this.encryption.decrypt(
          {
            ciphertext: message.currentRevision!.contentCiphertext,
            keyVersion: message.currentRevision!.keyVersion,
          },
          `tutor-message:${message.id}:${message.currentRevision!.revisionNo}`,
        ),
      }));
    await this.runtime.report(job, {
      stage: "GENERATING",
      processed: 0,
      total: null,
    });
    await this.runtime.checkpoint(job, {
      stage: "GENERATING",
      messageId: assistant.id,
    });
    const content = await this.ai.streamingText(
      job,
      assistant.session.userId,
      "TUTOR_RESPONSE",
      {
        taskType: "TUTOR_RESPONSE",
        candidateKey: job.id,
        messages: [
          {
            role: "system",
            content:
              "You are Sylis, an English learning tutor. Answer the learner directly, distinguish facts from suggestions, and use concise examples.",
          },
          ...promptMessages,
        ],
        maxTokens: 2_048,
        temperature: 0.3,
      },
    );
    const revisionId = randomUUID();
    const envelope = this.encryption.encrypt(
      content,
      `tutor-message:${assistant.id}:1`,
    );
    await this.database.$transaction(async (transaction) => {
      await transaction.tutorMessageRevision.create({
        data: {
          id: revisionId,
          messageId: assistant.id,
          revisionNo: 1,
          contentCiphertext: envelope.ciphertext,
          keyVersion: envelope.keyVersion,
          contentHash: `sha256:${createHash("sha256").update(content).digest("hex")}`,
          provider: this.config.aiProvider,
          model: this.config.aiModel,
        },
      });
      await transaction.tutorMessage.update({
        where: { id: assistant.id },
        data: { currentRevisionId: revisionId },
      });
    });
    await this.runtime.report(job, {
      stage: "PUBLISHED",
      processed: 1,
      total: 1,
      message: revisionId,
    });
  }

  private async requireConsent(userId: string, purpose: string) {
    const consent = await this.database.consentRecord.findFirst({
      where: { userId, purpose },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    });
    if (consent?.decision !== "GRANTED")
      throw new Error("AI_CONSENT_WITHDRAWN");
  }
}
