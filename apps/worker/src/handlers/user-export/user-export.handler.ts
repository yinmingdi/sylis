import { Inject, Injectable } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";

import { WORKER_DATABASE } from "../../adapters/database/database.module";
import { ContentEncryptionService } from "../../adapters/encryption/content-encryption.service";
import { ObjectStorageService } from "../../adapters/object-storage/object-storage.service";
import type { ClaimedWorkerJob } from "../../runtime/job-runtime.service";
import { JobRuntimeService } from "../../runtime/job-runtime.service";
import type { WorkerHandler } from "../../runtime/worker-handler";

@Injectable()
export class UserExportHandler implements WorkerHandler {
  readonly kind = "DATA_EXPORT" as const;

  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
    private readonly encryption: ContentEncryptionService,
    private readonly storage: ObjectStorageService,
    private readonly runtime: JobRuntimeService,
  ) {}

  async run(job: ClaimedWorkerJob): Promise<void> {
    const request = await this.database.dataExportRequest.findUnique({
      where: { jobId: job.id },
    });
    if (!request) throw new Error("DATA_EXPORT_REQUEST_MISSING");
    if (request.artifactUri) return;
    await this.runtime.report(job, {
      stage: "COLLECTING",
      processed: 0,
      total: null,
    });
    const [user, notebooks, reading, tutorSessions, diagnoses] =
      await Promise.all([
        this.database.user.findUniqueOrThrow({
          where: { id: request.userId },
          include: {
            emails: true,
            consents: true,
            sessions: {
              select: {
                id: true,
                audience: true,
                authStrength: true,
                createdAt: true,
                lastSeenAt: true,
                expiresAt: true,
                revokedAt: true,
                revokeReason: true,
              },
            },
            enrollments: true,
          },
        }),
        this.database.notebook.findMany({
          where: { userId: request.userId },
          include: { items: true },
        }),
        this.database.readingActivity.findMany({
          where: { userId: request.userId },
        }),
        this.database.tutorSession.findMany({
          where: { userId: request.userId },
          include: {
            messages: { include: { revisions: true, contextRefs: true } },
          },
        }),
        this.database.grammarDiagnosis.findMany({
          where: { userId: request.userId },
        }),
      ]);
    const exportedTutor = tutorSessions.map((session) => ({
      ...session,
      messages: session.messages.map((message) => ({
        ...message,
        revisions: message.revisions.map((revision) => ({
          ...revision,
          content: this.encryption.decrypt(
            {
              ciphertext: revision.contentCiphertext,
              keyVersion: revision.keyVersion,
            },
            `tutor-message:${message.id}:${revision.revisionNo}`,
          ),
          contentCiphertext: undefined,
          keyVersion: undefined,
        })),
      })),
    }));
    const exportedNotebooks = notebooks.map((notebook) => ({
      ...notebook,
      items: notebook.items.map((item) => ({
        ...item,
        note:
          item.noteCiphertext && item.keyVersion
            ? this.encryption.decrypt(
                {
                  ciphertext: item.noteCiphertext,
                  keyVersion: item.keyVersion,
                },
                `notebook-item:${item.id}`,
              )
            : null,
        noteCiphertext: undefined,
        keyVersion: undefined,
      })),
    }));
    const artifact = {
      schemaVersion: "sylis.user-export/1",
      exportedAt: new Date().toISOString(),
      user,
      notebooks: exportedNotebooks,
      reading,
      tutorSessions: exportedTutor,
      grammarDiagnoses: diagnoses.map((diagnosis) => ({
        id: diagnosis.id,
        languageTag: diagnosis.languageTag,
        createdAt: diagnosis.createdAt,
        input: this.encryption.decrypt(
          {
            ciphertext: diagnosis.inputCiphertext,
            keyVersion: diagnosis.keyVersion,
          },
          `grammar-diagnosis:${diagnosis.id}:input`,
        ),
        output: diagnosis.outputCiphertext
          ? this.encryption.decrypt(
              {
                ciphertext: diagnosis.outputCiphertext,
                keyVersion: diagnosis.keyVersion,
              },
              `grammar-diagnosis:${diagnosis.id}:output`,
            )
          : null,
      })),
    };
    const bytes = Buffer.from(JSON.stringify(artifact));
    await this.runtime.report(job, {
      stage: "UPLOADING",
      processed: bytes.length,
      total: bytes.length,
    });
    const uri = await this.storage.put(
      `user-exports/${request.userId}/${job.id}.json`,
      bytes,
      "application/json",
    );
    await this.database.dataExportRequest.update({
      where: { id: request.id },
      data: {
        artifactUri: uri,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
  }
}
