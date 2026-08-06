import { createDeepSeekAdapterFromEnv } from "@sylis/ai-provider/deepseek";
import { RetryableJobError, type JobResultRef } from "@sylis/background-jobs";
import type { SylisDatabase } from "@sylis/database";
import {
  compileLexicon,
  createS3ObjectStoragePort,
  publishContentAddressedObject,
  s3ObjectStorageConfigFromEnv,
} from "@sylis/lexicon-compiler";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { compilerAiOptionsFromPolicy } from "./compiler-ai-policy";
import type { CompilerRunnerConfig } from "../config/runner-config";
import {
  type ClaimedBuildJob,
  CompilerJobRuntime,
} from "../runtime/job-runtime";

const sha256 = (bytes: Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export class LexiconBuildHandler {
  readonly kind = "LEXICON_BUILD" as const;

  constructor(
    private readonly database: SylisDatabase,
    private readonly runtime: CompilerJobRuntime,
    private readonly config: CompilerRunnerConfig,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async run(job: ClaimedBuildJob): Promise<JobResultRef> {
    const request = await this.database.buildRun.findUnique({
      where: { jobId: job.id },
    });
    if (!request) throw new Error("LEXICON_BUILD_REQUEST_MISSING");

    const runRoot = resolve(this.config.workRoot, job.id);
    const outputRoot = resolve(this.config.artifactRoot, job.id);
    const outputPath = resolve(outputRoot, "sylis-lexicon-v1.json.zst");
    await mkdir(runRoot, { recursive: true });
    await mkdir(outputRoot, { recursive: true });

    const manifestPath = await this.materializeManifest(
      request.manifestUri,
      request.manifestHash,
      runRoot,
    );
    const ai = compilerAiOptionsFromPolicy(
      request.budgetMicros,
      request.modelPolicy,
    );
    if (ai && !this.config.aiEnabled) {
      throw new Error("LEXICON_AI_DISABLED");
    }
    const generation = ai
      ? createDeepSeekAdapterFromEnv({
          ...this.env,
          LEXICON_AI_MODEL: ai.requestedModel,
        })
      : undefined;
    const result = await compileLexicon(
      {
        manifestPath,
        profile: request.compileProfile as "pilot-200" | "core-20000",
        outputPath,
        workRoot: runRoot,
        ai,
      },
      {
        structuredGeneration: generation,
        progress: {
          report: async (event) => {
            await this.runtime.heartbeat(job);
            await this.runtime.report(job, {
              stage: event.stage,
              processed: event.processed,
              total: event.total,
              message: event.message,
            });
            await this.runtime.checkpoint(job, "lexicon-build/1", "1", {
              stage: event.stage,
              processed: event.processed,
              total: event.total,
            });
            if (await this.runtime.cancellationRequested(job)) {
              throw new Error("JOB_CANCELLED");
            }
          },
        },
      },
    );

    const artifactHash = result.artifactSha256;
    const artifactUri = await this.publishArtifact(outputPath, artifactHash);
    await this.runtime.succeed(job, {
      artifactUri,
      artifactHash,
      compilerRunId: result.runId,
    });
    return {
      resultType: "LEXICON_ARTIFACT",
      resultId: result.runId,
      uri: artifactUri,
      contentHash: result.contentHash,
      summary: {
        headwordCount: result.headwordCount,
        sourceRecordCount: result.sourceRecordCount,
      },
    };
  }

  private async publishArtifact(
    outputPath: string,
    artifactHash: string,
  ): Promise<string> {
    if (this.env.LEXICON_ARTIFACT_ALLOW_FILE === "true") {
      return `file://${outputPath}`;
    }
    const storage = createS3ObjectStoragePort(
      s3ObjectStorageConfigFromEnv(this.env),
    );
    const published = await publishContentAddressedObject(
      {
        inputPath: outputPath,
        sha256: artifactHash,
        objectName: "sylis-lexicon-v1.json.zst",
        contentType: "application/zstd",
      },
      storage,
    );
    return published.uri;
  }

  private async materializeManifest(
    uri: string,
    expectedHash: string,
    runRoot: string,
  ): Promise<string> {
    const path = resolve(
      runRoot,
      basename(new URL(uri).pathname || "manifest.json"),
    );
    let bytes: Buffer;
    if (uri.startsWith("file:")) {
      bytes = await readFile(new URL(uri));
    } else {
      let response: Response;
      try {
        response = await fetch(uri);
      } catch (error) {
        throw new RetryableJobError("LEXICON_MANIFEST_DOWNLOAD_FAILED", {
          cause: error,
        });
      }
      if (!response.ok) {
        const message = `LEXICON_MANIFEST_DOWNLOAD_HTTP_${response.status}`;
        if (response.status === 429 || response.status >= 500) {
          throw new RetryableJobError(message);
        }
        throw new Error(message);
      }
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (sha256(bytes) !== expectedHash) {
      throw new Error("LEXICON_MANIFEST_HASH_MISMATCH");
    }
    await writeFile(path, bytes, { mode: 0o600 });
    return path;
  }
}
