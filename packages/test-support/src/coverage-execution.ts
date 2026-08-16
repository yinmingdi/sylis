import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type {
  CoverageEvidence,
  CoverageManifest,
  CoverageRequirement,
} from "./coverage-manifest";
import {
  BrowserTarget,
  CiLane,
  RiskLevel,
  TestLayer,
  TestRunner,
  TestTag,
} from "./test-contract";

export enum TestExecutionStatus {
  PASSED = "PASSED",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
  TIMED_OUT = "TIMED_OUT",
  INTERRUPTED = "INTERRUPTED",
}

export enum CoverageReconciliationStatus {
  PASSED = "PASSED",
  WAIVED = "WAIVED",
  FAILED = "FAILED",
}

const MAX_WAIVER_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

export interface CollectedTestRecord {
  testId: string;
  caseId: string;
  runner: TestRunner;
  project: string;
  path: string;
  title: string;
  tags: TestTag[];
  browser: BrowserTarget | null;
  shard: string;
}

export interface PlannedTestsManifest {
  schemaVersion: 1;
  commitSha: string;
  ciLane: CiLane;
  generatedAt: string;
  tests: CollectedTestRecord[];
}

export interface TestExecutionRecord extends CollectedTestRecord {
  attempt: number;
  status: TestExecutionStatus;
  durationMs: number;
  artifactLinks: string[];
  errorDigest?: string;
}

export interface ExecutedTestsManifest {
  schemaVersion: 1;
  commitSha: string;
  ciLane: CiLane;
  generatedAt: string;
  tests: TestExecutionRecord[];
}

export interface CoverageWaiver {
  requirementId: string;
  testId: string;
  project: string;
  ciLane: CiLane;
  owner: string;
  reason: string;
  expiresAt: string;
  allowedStatus: TestExecutionStatus.SKIPPED;
}

export interface CoverageWaiverManifest {
  schemaVersion: 1;
  waivers: CoverageWaiver[];
}

export interface RequirementReconciliation {
  requirementId: string;
  declared: number;
  collected: number;
  executed: number;
  passed: number;
  waived: number;
  status: CoverageReconciliationStatus;
  issues: string[];
}

export interface CoverageReconciliationReport {
  schemaVersion: 1;
  commitSha: string;
  ciLane: CiLane;
  generatedAt: string;
  status: CoverageReconciliationStatus;
  requirements: RequirementReconciliation[];
  issues: string[];
}

export interface CreateExecutionManifestOptions<T> {
  commitSha: string;
  ciLane: CiLane;
  generatedAt?: string;
  tests: readonly T[];
}

export interface ReconcileCoverageOptions {
  manifest: CoverageManifest;
  planned: PlannedTestsManifest;
  executed: ExecutedTestsManifest;
  waivers: CoverageWaiverManifest;
  ciLane: CiLane;
  repositoryRoot: string;
  expectedCommitSha?: string;
  now?: Date;
}

export interface VitestCollectedTest {
  name: string;
  file: string;
  projectName?: string;
}

export interface VitestJsonAssertionResult {
  ancestorTitles?: string[];
  fullName: string;
  status: "passed" | "failed" | "pending" | "todo" | "skipped" | "disabled";
  title?: string;
  duration?: number | null;
  failureMessages: string[] | null;
}

export interface VitestJsonFileResult {
  name: string;
  assertionResults: VitestJsonAssertionResult[];
}

export interface VitestJsonReport {
  testResults: VitestJsonFileResult[];
}

export interface VitestNormalizationOptions {
  repositoryRoot: string;
  project: string;
  shard?: string;
}

interface EvidenceTarget {
  requirement: CoverageRequirement;
  evidence: CoverageEvidence;
  project: string;
}

export function createPlannedTestsManifest(
  options: CreateExecutionManifestOptions<CollectedTestRecord>,
): PlannedTestsManifest {
  const manifest: PlannedTestsManifest = {
    schemaVersion: 1,
    commitSha: requiredText(options.commitSha, "commitSha"),
    ciLane: options.ciLane,
    generatedAt: isoTimestamp(options.generatedAt),
    tests: [...options.tests].sort(compareCollectedTests),
  };
  assertValidManifest(
    validatePlannedTestsManifest(manifest),
    "INVALID_PLANNED_TESTS_MANIFEST",
  );
  return manifest;
}

export function createExecutedTestsManifest(
  options: CreateExecutionManifestOptions<TestExecutionRecord>,
): ExecutedTestsManifest {
  const manifest: ExecutedTestsManifest = {
    schemaVersion: 1,
    commitSha: requiredText(options.commitSha, "commitSha"),
    ciLane: options.ciLane,
    generatedAt: isoTimestamp(options.generatedAt),
    tests: [...options.tests].sort(
      (left, right) =>
        compareCollectedTests(left, right) || left.attempt - right.attempt,
    ),
  };
  assertValidManifest(
    validateExecutedTestsManifest(manifest),
    "INVALID_EXECUTED_TESTS_MANIFEST",
  );
  return manifest;
}

export function validatePlannedTestsManifest(value: unknown): string[] {
  return validateTestsManifest(value, "planned-tests.json", false);
}

export function validateExecutedTestsManifest(value: unknown): string[] {
  return validateTestsManifest(value, "executed-tests.json", true);
}

export function validateCoverageWaiverManifest(value: unknown): string[] {
  const label = "coverage waivers";
  if (!isRecord(value)) return [`${label} must be an object`];

  const issues: string[] = [];
  if (value.schemaVersion !== 1) {
    issues.push(`${label} schemaVersion must be 1`);
  }
  if (!Array.isArray(value.waivers)) {
    return [...issues, `${label} waivers must be an array`];
  }

  for (const [index, waiver] of value.waivers.entries()) {
    const path = `${label}.waivers[${index}]`;
    if (!isRecord(waiver)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    validateRequiredString(
      waiver.requirementId,
      `${path}.requirementId`,
      issues,
    );
    validateRequiredString(waiver.testId, `${path}.testId`, issues);
    validateRequiredString(waiver.project, `${path}.project`, issues);
    validateEnum(CiLane, waiver.ciLane, `${path}.ciLane`, issues);
    validateRequiredString(waiver.owner, `${path}.owner`, issues);
    validateRequiredString(waiver.reason, `${path}.reason`, issues);
    validateIsoTimestamp(waiver.expiresAt, `${path}.expiresAt`, issues);
    if (waiver.allowedStatus !== TestExecutionStatus.SKIPPED) {
      issues.push(`${path}.allowedStatus must be SKIPPED`);
    }
  }
  return issues;
}

export function normalizeVitestCollectedTests(
  tests: readonly VitestCollectedTest[],
  options: VitestNormalizationOptions,
): CollectedTestRecord[] {
  return tests.flatMap((test) => {
    const testId = stableTestId(test.name);
    if (!testId) return [];
    return [
      {
        testId,
        caseId: stableCaseId(`${options.project}:${test.file}:${test.name}`),
        runner: TestRunner.VITEST,
        project: options.project,
        path: repositoryRelativePath(options.repositoryRoot, test.file),
        title: test.name,
        tags: [],
        browser: null,
        shard: options.shard ?? "1/1",
      },
    ];
  });
}

export function normalizeVitestExecutionReport(
  report: VitestJsonReport,
  options: VitestNormalizationOptions,
): TestExecutionRecord[] {
  return report.testResults.flatMap((file) =>
    file.assertionResults.flatMap((assertion) => {
      const title = vitestAssertionTitle(assertion);
      const testId = stableTestId(title);
      if (!testId) return [];
      return [
        {
          testId,
          caseId: stableCaseId(`${options.project}:${file.name}:${title}`),
          runner: TestRunner.VITEST,
          project: options.project,
          path: repositoryRelativePath(options.repositoryRoot, file.name),
          title,
          tags: [],
          browser: null,
          shard: options.shard ?? "1/1",
          attempt: 0,
          status: vitestExecutionStatus(assertion.status),
          durationMs: assertion.duration ?? 0,
          artifactLinks: [],
          ...(assertion.failureMessages?.length
            ? {
                errorDigest: `sha256:${createTextDigest(
                  assertion.failureMessages.join("\n"),
                )}`,
              }
            : {}),
        },
      ];
    }),
  );
}

export function mergePlannedTestsManifests(
  manifests: readonly PlannedTestsManifest[],
): PlannedTestsManifest {
  manifests.forEach((manifest, index) =>
    assertValidManifest(
      validatePlannedTestsManifest(manifest),
      `INVALID_PLANNED_TESTS_MANIFEST:${index}`,
    ),
  );
  const identity = sharedManifestIdentity(manifests, "planned");
  const tests = new Map<string, CollectedTestRecord>();
  for (const manifest of manifests) {
    for (const test of manifest.tests) {
      const key = collectedTestKey(test);
      const existing = tests.get(key);
      if (existing && JSON.stringify(existing) !== JSON.stringify(test)) {
        throw new Error(`PLANNED_TEST_CONFLICT:${key}`);
      }
      tests.set(key, test);
    }
  }
  return createPlannedTestsManifest({
    ...identity,
    tests: [...tests.values()],
  });
}

export function mergeExecutedTestsManifests(
  manifests: readonly ExecutedTestsManifest[],
): ExecutedTestsManifest {
  manifests.forEach((manifest, index) =>
    assertValidManifest(
      validateExecutedTestsManifest(manifest),
      `INVALID_EXECUTED_TESTS_MANIFEST:${index}`,
    ),
  );
  const identity = sharedManifestIdentity(manifests, "executed");
  const tests = new Map<string, TestExecutionRecord>();
  for (const manifest of manifests) {
    for (const test of manifest.tests) {
      const key = `${collectedTestKey(test)}:${test.attempt}`;
      const existing = tests.get(key);
      if (existing && JSON.stringify(existing) !== JSON.stringify(test)) {
        throw new Error(`EXECUTED_TEST_CONFLICT:${key}`);
      }
      tests.set(key, test);
    }
  }
  return createExecutedTestsManifest({
    ...identity,
    tests: [...tests.values()],
  });
}

export function reconcileCoverage(
  options: ReconcileCoverageOptions,
): CoverageReconciliationReport {
  const now = options.now ?? new Date();
  const globalIssues = validateReportIdentity(options);
  const waiverIssues = validateCoverageWaivers(
    options.manifest,
    options.waivers,
    now,
  );
  globalIssues.push(...waiverIssues);

  const requirements = options.manifest.requirements
    .filter((requirement) => requirement.ciLanes.includes(options.ciLane))
    .map((requirement) => reconcileRequirement(requirement, options, now));
  const issues = [
    ...globalIssues,
    ...requirements.flatMap((requirement) => requirement.issues),
  ];

  return {
    schemaVersion: 1,
    commitSha: options.planned.commitSha,
    ciLane: options.ciLane,
    generatedAt: now.toISOString(),
    status:
      issues.length > 0
        ? CoverageReconciliationStatus.FAILED
        : requirements.some(
              (requirement) =>
                requirement.status === CoverageReconciliationStatus.WAIVED,
            )
          ? CoverageReconciliationStatus.WAIVED
          : CoverageReconciliationStatus.PASSED,
    requirements,
    issues,
  };
}

export function renderCoverageReconciliationMarkdown(
  report: CoverageReconciliationReport,
): string {
  const rows = report.requirements.map((requirement) => {
    const issues =
      requirement.issues.length > 0
        ? requirement.issues.join("<br>").replaceAll("|", "\\|")
        : "None";
    return `| ${requirement.requirementId} | ${requirement.declared} | ${requirement.collected} | ${requirement.executed} | ${requirement.passed} | ${requirement.waived} | ${requirement.status} | ${issues} |`;
  });
  return [
    "# Coverage Reconciliation",
    "",
    `- Commit: \`${report.commitSha}\``,
    `- CI lane: \`${report.ciLane}\``,
    `- Generated: ${report.generatedAt}`,
    `- Status: **${report.status}**`,
    "",
    "| Requirement | Declared | Collected | Executed | Passed | Waived | Status | Issues |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

export function validateBrowserEvidenceSource(
  evidence: CoverageEvidence,
  repositoryRoot: string,
): string[] {
  if (evidence.layer !== TestLayer.BROWSER_E2E) return [];
  const source = readFileSync(resolve(repositoryRoot, evidence.path), "utf8");
  const hasAction =
    /\.(?:goto|click|fill|check|uncheck|selectOption|press|setInputFiles|dragTo|tap)\s*\(/.test(
      source,
    );
  const hasLocator = /\.(?:getByRole|getByLabel|getByText|locator)\s*\(/.test(
    source,
  );
  const hasWebFirstAssertion =
    /\.to(?:BeVisible|BeHidden|BeEnabled|BeDisabled|BeChecked|HaveText|ContainText|HaveValue|HaveURL|HaveTitle|HaveAttribute|HaveCount)\s*\(/.test(
      source,
    );
  const issues: string[] = [];
  if (!hasAction) {
    issues.push(
      `${evidence.testId}: BROWSER_E2E source has no browser UI action`,
    );
  }
  if (!hasLocator || !hasWebFirstAssertion) {
    issues.push(
      `${evidence.testId}: BROWSER_E2E source has no web-first UI assertion`,
    );
  }
  return issues;
}

export function validateSystemEvidenceSource(
  evidence: CoverageEvidence,
  repositoryRoot: string,
): string[] {
  if (evidence.layer !== TestLayer.SYSTEM) return [];
  const source = readFileSync(resolve(repositoryRoot, evidence.path), "utf8");
  if (
    /(?:PrismaClient|@prisma\/client|\.prisma\.|\bprisma(?:\.[A-Za-z_$][\w$]*)?\.(?:create|update|delete|upsert))/.test(
      source,
    )
  ) {
    return [
      `${evidence.testId}: SYSTEM evidence must not write business state through Prisma`,
    ];
  }
  return [];
}

export function expectedBrowserTarget(project: string): BrowserTarget | null {
  if (project === "web:mobile") return BrowserTarget.MOBILE_CHROMIUM;
  if (project.includes("firefox")) return BrowserTarget.FIREFOX;
  if (project.includes("webkit")) return BrowserTarget.WEBKIT;
  if (
    project === "web:desktop" ||
    project === "web:accessibility" ||
    project === "admin:desktop" ||
    project === "admin:accessibility" ||
    project === "agent:desktop" ||
    project === "api:system" ||
    project === "system:exclusive" ||
    project.startsWith("deployment:")
  ) {
    return BrowserTarget.CHROMIUM;
  }
  return null;
}

function reconcileRequirement(
  requirement: CoverageRequirement,
  options: ReconcileCoverageOptions,
  now: Date,
): RequirementReconciliation {
  const targets = evidenceTargets(requirement, options.ciLane);
  const issues: string[] = [];
  let collected = 0;
  let executed = 0;
  let passed = 0;
  let waived = 0;

  for (const target of targets) {
    issues.push(
      ...validateBrowserEvidenceSource(target.evidence, options.repositoryRoot),
      ...validateSystemEvidenceSource(target.evidence, options.repositoryRoot),
    );
    const plannedMatches = options.planned.tests.filter((test) =>
      sameTarget(test, target),
    );
    if (plannedMatches.length === 0) {
      const wrongProjects = options.planned.tests
        .filter(
          (test) =>
            test.testId === target.evidence.testId &&
            test.runner === target.evidence.runner,
        )
        .map((test) => test.project);
      issues.push(
        wrongProjects.length > 0
          ? `${requirement.id}: ${target.evidence.testId} was collected in ${wrongProjects.join(", ")} instead of ${target.project}`
          : `${requirement.id}: ${target.evidence.testId} was not collected in ${target.project}`,
      );
      continue;
    }
    collected += plannedMatches.length;
    for (const planned of plannedMatches) {
      const label = caseLabel(planned, plannedMatches.length);
      issues.push(...validateCollectedTarget(requirement.id, target, planned));

      const attempts = options.executed.tests
        .filter((test) => sameExecutionTarget(test, planned))
        .sort((left, right) => left.attempt - right.attempt);
      if (attempts.length === 0) {
        issues.push(
          `${requirement.id}: ${label} was collected but not executed in ${target.project}`,
        );
        continue;
      }
      executed += 1;
      issues.push(
        ...validateExecutionIdentity(requirement.id, planned, attempts),
      );
      const lastAttempt = attempts.at(-1)!;
      const earlierFailure = attempts
        .slice(0, -1)
        .some((attempt) => attempt.status !== TestExecutionStatus.PASSED);
      if (lastAttempt.status === TestExecutionStatus.PASSED && earlierFailure) {
        issues.push(
          `${requirement.id}: ${label} is flaky in ${target.project}`,
        );
        continue;
      }
      if (lastAttempt.status === TestExecutionStatus.PASSED) {
        passed += 1;
        continue;
      }
      if (lastAttempt.status === TestExecutionStatus.SKIPPED) {
        if (activeWaiver(options.waivers, target, options.ciLane, now)) {
          waived += 1;
        } else {
          issues.push(
            `${requirement.id}: ${label} was skipped without an active waiver`,
          );
        }
        continue;
      }
      issues.push(
        `${requirement.id}: ${label} finished with ${lastAttempt.status}`,
      );
    }
  }

  return {
    requirementId: requirement.id,
    declared: targets.length,
    collected,
    executed,
    passed,
    waived,
    status:
      issues.length > 0
        ? CoverageReconciliationStatus.FAILED
        : waived > 0
          ? CoverageReconciliationStatus.WAIVED
          : CoverageReconciliationStatus.PASSED,
    issues,
  };
}

function evidenceTargets(
  requirement: CoverageRequirement,
  ciLane: CiLane,
): EvidenceTarget[] {
  return requirement.evidence
    .filter((evidence) => evidence.ciLanes.includes(ciLane))
    .flatMap((evidence) =>
      evidence.projects.map((project) => ({ requirement, evidence, project })),
    );
}

function validateCollectedTarget(
  requirementId: string,
  target: EvidenceTarget,
  planned: CollectedTestRecord,
): string[] {
  const issues: string[] = [];
  if (normalizePath(planned.path) !== normalizePath(target.evidence.path)) {
    issues.push(
      `${requirementId}: ${target.evidence.testId} path is ${planned.path}, expected ${target.evidence.path}`,
    );
  }
  const expectedBrowser = expectedBrowserTarget(target.project);
  if (planned.browser !== expectedBrowser) {
    issues.push(
      `${requirementId}: ${target.evidence.testId} browser is ${planned.browser ?? "NONE"}, expected ${expectedBrowser ?? "NONE"}`,
    );
  }
  if (target.evidence.runner === TestRunner.PLAYWRIGHT) {
    const declaredTags = [...target.evidence.tags].sort();
    const collectedTags = [...planned.tags].sort();
    if (declaredTags.join("\0") !== collectedTags.join("\0")) {
      issues.push(
        `${requirementId}: ${target.evidence.testId} tags are ${collectedTags.join(", ") || "NONE"}, expected ${declaredTags.join(", ")}`,
      );
    }
  }
  return issues;
}

function validateExecutionIdentity(
  requirementId: string,
  planned: CollectedTestRecord,
  attempts: readonly TestExecutionRecord[],
): string[] {
  const issues: string[] = [];
  for (const attempt of attempts) {
    if (normalizePath(attempt.path) !== normalizePath(planned.path)) {
      issues.push(
        `${requirementId}: ${planned.testId} execution path does not match its collected path`,
      );
    }
    if (attempt.browser !== planned.browser) {
      issues.push(
        `${requirementId}: ${planned.testId} execution browser does not match its collected browser`,
      );
    }
    if (attempt.title !== planned.title) {
      issues.push(
        `${requirementId}: ${planned.testId} execution title does not match its collected title`,
      );
    }
    if (
      [...attempt.tags].sort().join("\0") !==
      [...planned.tags].sort().join("\0")
    ) {
      issues.push(
        `${requirementId}: ${planned.testId} execution tags do not match its collected tags`,
      );
    }
    if (attempt.durationMs < 0 || !Number.isFinite(attempt.durationMs)) {
      issues.push(
        `${requirementId}: ${planned.testId} has invalid execution duration`,
      );
    }
  }
  return issues;
}

function validateReportIdentity(options: ReconcileCoverageOptions): string[] {
  const issues: string[] = [];
  if (options.planned.schemaVersion !== 1) {
    issues.push("planned-tests.json schemaVersion must be 1");
  }
  if (options.executed.schemaVersion !== 1) {
    issues.push("executed-tests.json schemaVersion must be 1");
  }
  if (options.planned.ciLane !== options.ciLane) {
    issues.push(
      `planned-tests.json lane ${options.planned.ciLane} does not match ${options.ciLane}`,
    );
  }
  if (options.executed.ciLane !== options.ciLane) {
    issues.push(
      `executed-tests.json lane ${options.executed.ciLane} does not match ${options.ciLane}`,
    );
  }
  if (options.planned.commitSha !== options.executed.commitSha) {
    issues.push("planned and executed manifests must use the same commit SHA");
  }
  if (
    options.expectedCommitSha &&
    options.planned.commitSha !== options.expectedCommitSha
  ) {
    issues.push(
      `planned and executed manifests use ${options.planned.commitSha}, expected ${options.expectedCommitSha}`,
    );
  }
  const plannedKeys = new Set(options.planned.tests.map(collectedTestKey));
  const attemptsByCase = new Map<string, number[]>();
  for (const execution of options.executed.tests) {
    const executionKey = collectedTestKey(execution);
    if (!plannedKeys.has(executionKey)) {
      issues.push(
        `executed-tests.json contains an unplanned case: ${executionKey}`,
      );
    }
    const attempts = attemptsByCase.get(executionKey) ?? [];
    attempts.push(execution.attempt);
    attemptsByCase.set(executionKey, attempts);
  }
  for (const [key, attempts] of attemptsByCase) {
    const ordered = [...attempts].sort((left, right) => left - right);
    if (ordered.some((attempt, index) => attempt !== index)) {
      issues.push(
        `executed-tests.json attempts must be contiguous from zero: ${key}`,
      );
    }
  }
  return issues;
}

function validateCoverageWaivers(
  manifest: CoverageManifest,
  waivers: CoverageWaiverManifest,
  now: Date,
): string[] {
  const issues: string[] = [];
  if (waivers.schemaVersion !== 1) {
    issues.push("coverage waivers schemaVersion must be 1");
  }
  const seen = new Set<string>();
  for (const waiver of waivers.waivers) {
    const key = `${waiver.requirementId}:${waiver.testId}:${waiver.project}:${waiver.ciLane}`;
    if (seen.has(key)) issues.push(`Duplicate coverage waiver: ${key}`);
    seen.add(key);
    const requirement = manifest.requirements.find(
      (candidate) => candidate.id === waiver.requirementId,
    );
    const evidence = requirement?.evidence.find(
      (candidate) =>
        candidate.testId === waiver.testId &&
        candidate.projects.includes(waiver.project) &&
        candidate.ciLanes.includes(waiver.ciLane),
    );
    if (!evidence)
      issues.push(`Coverage waiver does not match evidence: ${key}`);
    if (requirement?.risk === RiskLevel.CRITICAL) {
      issues.push(`Critical requirement cannot be waived: ${key}`);
    }
    if (!waiver.owner.trim() || !waiver.reason.trim()) {
      issues.push(`Coverage waiver requires owner and reason: ${key}`);
    }
    const expiresAt = Date.parse(waiver.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      issues.push(`Coverage waiver is expired or invalid: ${key}`);
    } else if (expiresAt - now.getTime() > MAX_WAIVER_DURATION_MS) {
      issues.push(`Coverage waiver exceeds seven days: ${key}`);
    }
    if (waiver.allowedStatus !== TestExecutionStatus.SKIPPED) {
      issues.push(`Coverage waiver may only allow SKIPPED: ${key}`);
    }
  }
  return issues;
}

function activeWaiver(
  manifest: CoverageWaiverManifest,
  target: EvidenceTarget,
  ciLane: CiLane,
  now: Date,
): boolean {
  return manifest.waivers.some(
    (waiver) =>
      waiver.requirementId === target.requirement.id &&
      waiver.testId === target.evidence.testId &&
      waiver.project === target.project &&
      waiver.ciLane === ciLane &&
      waiver.allowedStatus === TestExecutionStatus.SKIPPED &&
      Date.parse(waiver.expiresAt) > now.getTime(),
  );
}

function sameTarget(
  test: CollectedTestRecord,
  target: EvidenceTarget,
): boolean {
  return (
    test.testId === target.evidence.testId &&
    test.runner === target.evidence.runner &&
    test.project === target.project
  );
}

function sameExecutionTarget(
  test: TestExecutionRecord,
  planned: CollectedTestRecord,
): boolean {
  return (
    test.testId === planned.testId &&
    test.runner === planned.runner &&
    test.project === planned.project &&
    test.caseId === planned.caseId &&
    test.shard === planned.shard
  );
}

function compareCollectedTests(
  left: CollectedTestRecord,
  right: CollectedTestRecord,
): number {
  return (
    left.testId.localeCompare(right.testId) ||
    left.runner.localeCompare(right.runner) ||
    left.project.localeCompare(right.project) ||
    left.caseId.localeCompare(right.caseId) ||
    left.shard.localeCompare(right.shard)
  );
}

function collectedTestKey(test: CollectedTestRecord): string {
  return `${test.testId}:${test.runner}:${test.project}:${test.caseId}:${test.shard}`;
}

function sharedManifestIdentity(
  manifests: readonly (PlannedTestsManifest | ExecutedTestsManifest)[],
  kind: string,
): { commitSha: string; ciLane: CiLane; generatedAt: string } {
  const first = manifests[0];
  if (!first) throw new Error(`${kind.toUpperCase()}_MANIFEST_REQUIRED`);
  for (const manifest of manifests.slice(1)) {
    if (
      manifest.commitSha !== first.commitSha ||
      manifest.ciLane !== first.ciLane
    ) {
      throw new Error(`${kind.toUpperCase()}_MANIFEST_IDENTITY_MISMATCH`);
    }
  }
  const generatedAt = manifests
    .map((manifest) => manifest.generatedAt)
    .sort()
    .at(-1)!;
  return {
    commitSha: first.commitSha,
    ciLane: first.ciLane,
    generatedAt,
  };
}

function isoTimestamp(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) {
    throw new Error("generatedAt must be an ISO timestamp");
  }
  return date.toISOString();
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function normalizePath(value: string): string {
  return value.split(sep).join("/").replaceAll("\\", "/");
}

export function repositoryRelativePath(
  repositoryRoot: string,
  absolutePath: string,
): string {
  return normalizePath(relative(repositoryRoot, absolutePath));
}

export function stableTestId(title: string): string | null {
  return (
    title.match(/\[?([A-Z][A-Z0-9_-]*-[0-9]{3}(?:-[A-Z0-9_-]+)?)\]?/)?.[1] ??
    null
  );
}

export function stableCaseId(identity: string): string {
  return createTextDigest(identity).slice(0, 16);
}

function caseLabel(test: CollectedTestRecord, caseCount: number): string {
  return caseCount > 1 ? `${test.testId}[${test.caseId}]` : test.testId;
}

function vitestExecutionStatus(
  status: VitestJsonAssertionResult["status"],
): TestExecutionStatus {
  switch (status) {
    case "passed":
      return TestExecutionStatus.PASSED;
    case "failed":
      return TestExecutionStatus.FAILED;
    case "pending":
    case "todo":
    case "skipped":
    case "disabled":
      return TestExecutionStatus.SKIPPED;
  }
}

function vitestAssertionTitle(assertion: VitestJsonAssertionResult): string {
  if (assertion.title && assertion.ancestorTitles?.length) {
    return [...assertion.ancestorTitles, assertion.title].join(" > ");
  }
  return assertion.fullName;
}

function validateTestsManifest(
  value: unknown,
  label: string,
  executed: boolean,
): string[] {
  if (!isRecord(value)) return [`${label} must be an object`];

  const issues: string[] = [];
  if (value.schemaVersion !== 1) {
    issues.push(`${label} schemaVersion must be 1`);
  }
  if (
    typeof value.commitSha !== "string" ||
    !/^(?:WORKTREE|[0-9a-f]{40,64})$/i.test(value.commitSha)
  ) {
    issues.push(`${label}.commitSha must be WORKTREE or a full Git SHA`);
  }
  validateEnum(CiLane, value.ciLane, `${label}.ciLane`, issues);
  validateIsoTimestamp(value.generatedAt, `${label}.generatedAt`, issues);
  if (!Array.isArray(value.tests)) {
    return [...issues, `${label}.tests must be an array`];
  }

  const keys = new Set<string>();
  for (const [index, test] of value.tests.entries()) {
    const path = `${label}.tests[${index}]`;
    const recordIssues = validateCollectedTestRecord(test, path);
    if (executed && isRecord(test)) {
      validateExecutionRecord(test, path, recordIssues);
    }
    issues.push(...recordIssues);
    if (recordIssues.length > 0) continue;

    const record = test as unknown as CollectedTestRecord;
    const key = executed
      ? `${collectedTestKey(record)}:${(test as unknown as TestExecutionRecord).attempt}`
      : collectedTestKey(record);
    if (keys.has(key))
      issues.push(`${label} contains duplicate test record: ${key}`);
    keys.add(key);
  }
  return issues;
}

function validateCollectedTestRecord(value: unknown, path: string): string[] {
  if (!isRecord(value)) return [`${path} must be an object`];

  const issues: string[] = [];
  if (
    typeof value.testId !== "string" ||
    !/^[A-Z][A-Z0-9_-]*-[0-9]{3}(?:-[A-Z0-9_-]+)?$/.test(value.testId)
  ) {
    issues.push(`${path}.testId is invalid`);
  }
  validateRequiredString(value.caseId, `${path}.caseId`, issues);
  validateEnum(TestRunner, value.runner, `${path}.runner`, issues);
  validateRequiredString(value.project, `${path}.project`, issues);
  if (!portableRelativePath(value.path)) {
    issues.push(`${path}.path must be repository-relative`);
  }
  validateRequiredString(value.title, `${path}.title`, issues);
  if (
    typeof value.testId === "string" &&
    typeof value.title === "string" &&
    !value.title.includes(value.testId)
  ) {
    issues.push(`${path}.title must contain its testId`);
  }
  if (
    !Array.isArray(value.tags) ||
    !value.tags.every((tag) => isEnumValue(TestTag, tag))
  ) {
    issues.push(`${path}.tags must contain only TestTag values`);
  }
  if (value.browser !== null && !isEnumValue(BrowserTarget, value.browser)) {
    issues.push(`${path}.browser must be null or a BrowserTarget`);
  }
  if (!validShard(value.shard)) {
    issues.push(`${path}.shard must be INDEX/TOTAL with 1 <= INDEX <= TOTAL`);
  }
  return issues;
}

function validateExecutionRecord(
  value: Record<string, unknown>,
  path: string,
  issues: string[],
): void {
  if (!Number.isInteger(value.attempt) || Number(value.attempt) < 0) {
    issues.push(`${path}.attempt must be a non-negative integer`);
  }
  validateEnum(TestExecutionStatus, value.status, `${path}.status`, issues);
  if (
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0
  ) {
    issues.push(`${path}.durationMs must be a non-negative finite number`);
  }
  if (
    !Array.isArray(value.artifactLinks) ||
    !value.artifactLinks.every(
      (link) => typeof link === "string" && link.trim().length > 0,
    )
  ) {
    issues.push(`${path}.artifactLinks must contain non-empty strings`);
  }
  if (
    value.errorDigest !== undefined &&
    (typeof value.errorDigest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/i.test(value.errorDigest))
  ) {
    issues.push(`${path}.errorDigest must be a SHA-256 digest`);
  }
}

function validateRequiredString(
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`);
  }
}

function validateIsoTimestamp(
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (typeof value !== "string") {
    issues.push(`${path} must be an ISO timestamp`);
    return;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    issues.push(`${path} must be an ISO timestamp`);
  }
}

function validateEnum<T extends Record<string, string>>(
  values: T,
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (!isEnumValue(values, value)) {
    issues.push(`${path} has invalid value ${String(value)}`);
  }
}

function isEnumValue<T extends Record<string, string>>(
  values: T,
  value: unknown,
): value is T[keyof T] {
  return typeof value === "string" && Object.values(values).includes(value);
}

function portableRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !isAbsolute(value) &&
    !/^[a-zA-Z]:[\\/]/.test(value) &&
    !value.startsWith("\\\\") &&
    !value.split(/[\\/]/).includes("..")
  );
}

function validShard(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) return false;
  const index = Number(match[1]);
  const total = Number(match[2]);
  return index >= 1 && total >= 1 && index <= total;
}

function assertValidManifest(issues: readonly string[], code: string): void {
  if (issues.length === 0) return;
  throw new Error(`${code}\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createTextDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
