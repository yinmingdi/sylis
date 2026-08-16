import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import {
  CiLane,
  TestExecutionStatus,
  TestRunner,
  createExecutedTestsManifest,
  createPlannedTestsManifest,
  expectedBrowserTarget,
  repositoryRelativePath,
  stableTestId,
  type CollectedTestRecord,
  type TestExecutionRecord,
  type TestTag,
} from "@sylis/test-support";

interface CoverageReporterOptions {
  outputDir?: string;
  repositoryRoot?: string;
  ciLane?: string;
  commitSha?: string;
  shard?: string;
  scope?: string;
}

export default class CoverageReporter implements Reporter {
  private readonly repositoryRoot: string;
  private readonly outputDir: string;
  private readonly ciLane: CiLane;
  private readonly commitSha: string;
  private readonly shard: string;
  private readonly scope: string;
  private readonly generatedAt = new Date().toISOString();
  private readonly executions: TestExecutionRecord[] = [];
  private reporterError: Error | null = null;

  constructor(options: CoverageReporterOptions = {}) {
    this.repositoryRoot = resolve(
      options.repositoryRoot ?? process.env.INIT_CWD ?? process.cwd(),
    );
    this.outputDir = resolve(
      this.repositoryRoot,
      options.outputDir ??
        process.env.E2E_EVIDENCE_OUTPUT_DIR ??
        "tests/e2e/evidence/fragments",
    );
    this.ciLane = parseCiLane(
      options.ciLane ?? process.env.E2E_CI_LANE ?? "PULL_REQUEST",
    );
    this.commitSha =
      options.commitSha ??
      process.env.GITHUB_SHA ??
      process.env.E2E_COMMIT_SHA ??
      "WORKTREE";
    this.shard =
      options.shard ??
      `${process.env.E2E_SHARD_INDEX ?? "1"}/${process.env.E2E_SHARD_TOTAL ?? "1"}`;
    this.scope = options.scope ?? process.env.E2E_OUTPUT_SUITE ?? "adhoc";
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.capture(() => {
      const tests = suite
        .allTests()
        .map((test) => this.collectedTest(test))
        .filter((test): test is CollectedTestRecord => test !== null);
      this.write(
        `planned-${safeFilePart(this.scope)}-${safeFilePart(this.shard)}.json`,
        createPlannedTestsManifest({
          commitSha: this.commitSha,
          ciLane: this.ciLane,
          generatedAt: this.generatedAt,
          tests,
        }),
      );
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.capture(() => {
      const collected = this.collectedTest(test);
      if (!collected) return;
      this.executions.push({
        ...collected,
        attempt: result.retry,
        status: executionStatus(result.status),
        durationMs: result.duration,
        artifactLinks: result.attachments.map(
          (attachment) => `attachment:${attachment.name}`,
        ),
        ...(result.errors.length > 0
          ? { errorDigest: digestErrors(result.errors) }
          : {}),
      });
    });
  }

  onEnd(
    _result: FullResult,
  ): void | Promise<{ status?: FullResult["status"] }> {
    this.capture(() => {
      this.write(
        `executed-${safeFilePart(this.scope)}-${safeFilePart(this.shard)}.json`,
        createExecutedTestsManifest({
          commitSha: this.commitSha,
          ciLane: this.ciLane,
          generatedAt: this.generatedAt,
          tests: this.executions,
        }),
      );
    });
    if (this.reporterError) {
      process.stderr.write(
        `Coverage reporter failed: ${this.reporterError.message}\n`,
      );
      return Promise.resolve({ status: "failed" });
    }
  }

  private collectedTest(test: TestCase): CollectedTestRecord | null {
    const testId = stableTestId(test.title);
    if (!testId) return null;
    const project = test.parent.project()?.name;
    if (!project) throw new Error(`PLAYWRIGHT_PROJECT_MISSING:${testId}`);
    return {
      testId,
      caseId: test.id,
      runner: TestRunner.PLAYWRIGHT,
      project,
      path: repositoryRelativePath(this.repositoryRoot, test.location.file),
      title: test.title,
      tags: test.tags
        .map((tag) => tag.replace(/^@/, "").toUpperCase())
        .filter((tag): tag is TestTag => tag.length > 0),
      browser: expectedBrowserTarget(project),
      shard: this.shard,
    };
  }

  private write(filename: string, value: unknown): void {
    mkdirSync(this.outputDir, { recursive: true });
    writeFileSync(
      resolve(this.outputDir, filename),
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
  }

  private capture(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.reporterError =
        error instanceof Error ? error : new Error(String(error));
    }
  }
}

function parseCiLane(value: string): CiLane {
  const normalized = value.trim().replaceAll("-", "_").toUpperCase();
  const lane = Object.values(CiLane).find(
    (candidate) => candidate === normalized,
  );
  if (!lane) throw new Error(`INVALID_CI_LANE:${value}`);
  return lane;
}

function executionStatus(status: TestResult["status"]): TestExecutionStatus {
  switch (status) {
    case "passed":
      return TestExecutionStatus.PASSED;
    case "failed":
      return TestExecutionStatus.FAILED;
    case "skipped":
      return TestExecutionStatus.SKIPPED;
    case "timedOut":
      return TestExecutionStatus.TIMED_OUT;
    case "interrupted":
      return TestExecutionStatus.INTERRUPTED;
  }
}

function digestErrors(
  errors: readonly { message?: string; stack?: string }[],
): string {
  return `sha256:${createHash("sha256")
    .update(
      errors
        .map((error) => error.stack ?? error.message ?? "UNKNOWN_ERROR")
        .join("\n"),
    )
    .digest("hex")}`;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-");
}
