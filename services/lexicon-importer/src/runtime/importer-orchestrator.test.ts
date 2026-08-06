import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SylisDatabase } from "@sylis/database";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImporterConfig } from "../config/importer-config";
import {
  ImporterOrchestrator,
  type ImporterDependencies,
  type ImporterRuntime,
} from "./importer-orchestrator";
import type { ClaimedImporterJob } from "./job-runtime";

const workRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    workRoots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

const importJob: ClaimedImporterJob = {
  id: "job-1",
  kind: "LEXICON_IMPORT",
  inputHash: "sha256:input",
  attempt: 1,
  maxAttempts: 3,
  leaseToken: "lease-1",
};

function runtime(job: ClaimedImporterJob | null = importJob) {
  const mocks = {
    claim: vi.fn(async () => job),
    latestCheckpoint: vi.fn(
      async (): Promise<Record<string, unknown> | null> => null,
    ),
    checkpoint: vi.fn(async () => undefined),
    heartbeat: vi.fn(async () => undefined),
    report: vi.fn(async () => undefined),
    succeed: vi.fn(async () => undefined),
    cancellationRequested: vi.fn(async () => false),
    fail: vi.fn(async () => undefined),
  };
  return { mocks, value: mocks as unknown as ImporterRuntime };
}

async function config(): Promise<ImporterConfig> {
  const workRoot = await mkdtemp(join(tmpdir(), "sylis-importer-test-"));
  workRoots.push(workRoot);
  return {
    databaseUrl: "postgresql://test",
    instanceId: "test-importer",
    workRoot,
    pollIntervalMs: 1,
    leaseDurationMs: 60_000,
    checkpointKey: Buffer.alloc(32),
    port: 0,
  };
}

function dependencies(): {
  mocks: Record<keyof ImporterDependencies, ReturnType<typeof vi.fn>>;
  value: ImporterDependencies;
} {
  const mocks = {
    materializeArtifact: vi.fn(async () => "/tmp/artifact.json.zst"),
    preflightArtifact: vi.fn(async () => ({
      artifactHash: "sha256:artifact",
      contentHash: "sha256:content",
      counts: { headwords: 2, senses: 3 },
      validationSummary: { errors: [], warnings: [] },
    })),
    stageArtifact: vi.fn(async () => ({
      counts: { headwords: 2, senses: 3 },
      manifest: { buildId: "build-1" },
    })),
    buildDraftRelease: vi.fn(async () => ({
      releaseId: "release-1",
      reused: false,
    })),
    validateDraftRelease: vi.fn(async () => ({ valid: true })),
  };
  return {
    mocks,
    value: mocks as unknown as ImporterDependencies,
  };
}

describe("ImporterOrchestrator", () => {
  it("returns without delay when a job was claimed and imported", async () => {
    const importerRuntime = runtime();
    const importerDependencies = dependencies();
    const database = {
      importJob: {
        findUnique: vi.fn(async () => ({
          artifactUri: "s3://artifacts/release.json.zst",
          artifactHash: "sha256:artifact",
        })),
      },
    } as unknown as SylisDatabase;
    const orchestrator = new ImporterOrchestrator(
      database,
      importerRuntime.value,
      await config(),
      importerDependencies.value,
    );

    await expect(orchestrator.runOnce()).resolves.toBe(true);
    expect(importerDependencies.mocks.stageArtifact).toHaveBeenCalledOnce();
    expect(importerRuntime.mocks.report).toHaveBeenCalledWith(
      importJob,
      expect.objectContaining({ stage: "STAGING", total: 5 }),
    );
    expect(importerRuntime.mocks.checkpoint).toHaveBeenLastCalledWith(
      importJob,
      "lexicon-import/1",
      "1",
      expect.objectContaining({
        stage: "DRAFT_BUILT",
        releaseId: "release-1",
      }),
    );
    expect(importerRuntime.mocks.succeed).toHaveBeenCalledWith(importJob);
    expect(importerRuntime.mocks.fail).not.toHaveBeenCalled();
  });

  it("reuses a completed checkpoint without rebuilding the release", async () => {
    const importerRuntime = runtime();
    importerRuntime.mocks.latestCheckpoint.mockResolvedValue({
      stage: "DRAFT_BUILT",
      artifactHash: "sha256:artifact",
      releaseId: "release-1",
    });
    const importerDependencies = dependencies();
    const database = {
      importJob: {
        findUnique: vi.fn(async () => ({
          artifactUri: "s3://artifacts/release.json.zst",
          artifactHash: "sha256:artifact",
        })),
      },
    } as unknown as SylisDatabase;
    const orchestrator = new ImporterOrchestrator(
      database,
      importerRuntime.value,
      await config(),
      importerDependencies.value,
    );

    await expect(orchestrator.runOnce()).resolves.toBe(true);
    expect(
      importerDependencies.mocks.materializeArtifact,
    ).not.toHaveBeenCalled();
    expect(importerRuntime.mocks.succeed).toHaveBeenCalledOnce();
  });

  it("persists validation results before succeeding", async () => {
    const validationJob = { ...importJob, kind: "LEXICON_VALIDATE" as const };
    const importerRuntime = runtime(validationJob);
    const importerDependencies = dependencies();
    const update = vi.fn(async () => ({}));
    const database = {
      lexiconValidationRequest: {
        findUnique: vi.fn(async () => ({
          id: "request-1",
          releaseId: "release-1",
        })),
        update,
      },
    } as unknown as SylisDatabase;
    const orchestrator = new ImporterOrchestrator(
      database,
      importerRuntime.value,
      await config(),
      importerDependencies.value,
    );

    await expect(orchestrator.runOnce()).resolves.toBe(true);
    expect(
      importerDependencies.mocks.validateDraftRelease,
    ).toHaveBeenCalledWith(database, "release-1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { summary: { valid: true } },
    });
    expect(importerRuntime.mocks.succeed).toHaveBeenCalledWith(validationJob);
  });

  it("moves a failed job through the runtime failure policy", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const importerRuntime = runtime();
    const database = {
      importJob: { findUnique: vi.fn(async () => null) },
    } as unknown as SylisDatabase;
    const orchestrator = new ImporterOrchestrator(
      database,
      importerRuntime.value,
      await config(),
      dependencies().value,
    );

    await expect(orchestrator.runOnce()).resolves.toBe(true);
    expect(importerRuntime.mocks.fail).toHaveBeenCalledWith(
      importJob,
      expect.objectContaining({ message: "LEXICON_IMPORT_REQUEST_MISSING" }),
    );
    expect(importerRuntime.mocks.succeed).not.toHaveBeenCalled();
  });

  it("returns false when no work is available", async () => {
    const importerRuntime = runtime(null);
    const orchestrator = new ImporterOrchestrator(
      {} as SylisDatabase,
      importerRuntime.value,
      await config(),
      dependencies().value,
    );

    await expect(orchestrator.runOnce()).resolves.toBe(false);
    expect(importerRuntime.mocks.succeed).not.toHaveBeenCalled();
  });
});
