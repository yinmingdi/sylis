import { Inject, Injectable } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";

import { AiGatewayService } from "../../adapters/ai-provider/ai-gateway.service";
import { WORKER_DATABASE } from "../../adapters/database/database.module";
import { ContentEncryptionService } from "../../adapters/encryption/content-encryption.service";
import type { ClaimedWorkerJob } from "../../runtime/job-runtime.service";
import { JobRuntimeService } from "../../runtime/job-runtime.service";
import type { WorkerHandler } from "../../runtime/worker-handler";

interface GrammarResult {
  correctedText: string;
  summary: string;
  issues: Array<{
    startOffset: number;
    endOffset: number;
    category: string;
    explanation: string;
    suggestion: string;
  }>;
}

@Injectable()
export class GrammarDiagnosisHandler implements WorkerHandler {
  readonly kind = "GRAMMAR_DIAGNOSIS" as const;

  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: ContentEncryptionService,
    private readonly ai: AiGatewayService,
    private readonly runtime: JobRuntimeService,
  ) {}

  async run(job: ClaimedWorkerJob): Promise<void> {
    const diagnosis = await this.database.grammarDiagnosis.findUnique({
      where: { jobId: job.id },
    });
    if (!diagnosis) throw new Error("GRAMMAR_DIAGNOSIS_REQUEST_MISSING");
    if (diagnosis.outputCiphertext) return;
    const consent = await this.database.consentRecord.findFirst({
      where: { userId: diagnosis.userId, purpose: "AI_GRAMMAR" },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    });
    if (consent?.decision !== "GRANTED")
      throw new Error("AI_CONSENT_WITHDRAWN");
    const input = this.encryption.decrypt(
      {
        ciphertext: diagnosis.inputCiphertext,
        keyVersion: diagnosis.keyVersion,
      },
      `grammar-diagnosis:${diagnosis.id}:input`,
    );
    await this.runtime.report(job, {
      stage: "DIAGNOSING",
      processed: 0,
      total: 1,
    });
    const result = await this.ai.structured<GrammarResult>(
      job,
      diagnosis.userId,
      "GRAMMAR_DIAGNOSIS",
      {
        taskType: "GRAMMAR_DIAGNOSIS",
        schemaName: "sylis_grammar_diagnosis",
        candidateKey: job.id,
        systemPrompt:
          "Diagnose grammar without changing the learner's intended meaning. Offsets are UTF-16 offsets into the exact input. Return JSON through the tool only.",
        input: { languageTag: diagnosis.languageTag, text: input },
        maxTokens: 2_048,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["correctedText", "summary", "issues"],
          properties: {
            correctedText: { type: "string" },
            summary: { type: "string" },
            issues: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "startOffset",
                  "endOffset",
                  "category",
                  "explanation",
                  "suggestion",
                ],
                properties: {
                  startOffset: { type: "integer", minimum: 0 },
                  endOffset: { type: "integer", minimum: 0 },
                  category: { type: "string" },
                  explanation: { type: "string" },
                  suggestion: { type: "string" },
                },
              },
            },
          },
        },
      },
    );
    if (
      typeof result.correctedText !== "string" ||
      !Array.isArray(result.issues) ||
      result.issues.some(
        (issue) =>
          issue.startOffset < 0 ||
          issue.endOffset < issue.startOffset ||
          issue.endOffset > input.length,
      )
    ) {
      throw new Error("GRAMMAR_DIAGNOSIS_INVALID");
    }
    const output = JSON.stringify(result);
    const envelope = this.encryption.encrypt(
      output,
      `grammar-diagnosis:${diagnosis.id}:output`,
    );
    await this.database.grammarDiagnosis.update({
      where: { id: diagnosis.id },
      data: {
        outputCiphertext: envelope.ciphertext,
        keyVersion: envelope.keyVersion,
      },
    });
    await this.runtime.report(job, {
      stage: "PUBLISHED",
      processed: 1,
      total: 1,
    });
  }
}
