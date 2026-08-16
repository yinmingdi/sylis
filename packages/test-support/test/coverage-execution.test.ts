import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BrowserTarget,
  CiLane,
  type CollectedTestRecord,
  type CoverageManifest,
  CoverageOwner,
  CoverageReconciliationStatus,
  type CoverageWaiverManifest,
  type ExecutedTestsManifest,
  RiskLevel,
  TestExecutionStatus,
  TestLayer,
  TestRunner,
  TestTag,
  createExecutedTestsManifest,
  createPlannedTestsManifest,
  mergeExecutedTestsManifests,
  mergePlannedTestsManifests,
  normalizeVitestCollectedTests,
  normalizeVitestExecutionReport,
  reconcileCoverage,
  renderCoverageReconciliationMarkdown,
  validateCoverageWaiverManifest,
  validateExecutedTestsManifest,
  validatePlannedTestsManifest,
  validateSystemEvidenceSource,
} from "../src";

const repositoryRoot = resolve(import.meta.dirname, "fixtures/repository");
const commitSha = "0123456789abcdef0123456789abcdef01234567";
const generatedAt = "2026-08-10T00:00:00.000Z";

describe("coverage execution evidence", () => {
  it("[TEST-GOVERNANCE-012] creates and merges deterministic runner manifests", () => {
    const first = createPlannedTestsManifest({
      commitSha,
      ciLane: CiLane.PULL_REQUEST,
      generatedAt,
      tests: [collectedTest({ shard: "2/2" })],
    });
    const second = createPlannedTestsManifest({
      commitSha,
      ciLane: CiLane.PULL_REQUEST,
      generatedAt,
      tests: [collectedTest({ shard: "1/2", project: "admin:desktop" })],
    });
    const planned = mergePlannedTestsManifests([first, second]);
    expect(planned.tests.map((test) => test.shard)).toEqual(["1/2", "2/2"]);

    const executed = mergeExecutedTestsManifests([
      executionManifest(TestExecutionStatus.PASSED, 0, {
        shard: "2/2",
      }),
      executionManifest(TestExecutionStatus.PASSED, 0, {
        shard: "1/2",
        project: "admin:desktop",
      }),
    ]);
    expect(executed.tests).toHaveLength(2);
  });

  it("[TEST-GOVERNANCE-013] proves declared collected executed and first-pass evidence", () => {
    const report = reconcileCoverage(
      reconciliationOptions(
        createPlannedTestsManifest({
          commitSha,
          ciLane: CiLane.PULL_REQUEST,
          generatedAt,
          tests: [collectedTest()],
        }),
        executionManifest(TestExecutionStatus.PASSED),
      ),
    );

    expect(report).toMatchObject({
      status: CoverageReconciliationStatus.PASSED,
      issues: [],
      requirements: [
        {
          requirementId: "IDENTITY-001",
          declared: 1,
          collected: 1,
          executed: 1,
          passed: 1,
          waived: 0,
          status: CoverageReconciliationStatus.PASSED,
        },
      ],
    });
    expect(renderCoverageReconciliationMarkdown(report)).toContain(
      "| IDENTITY-001 | 1 | 1 | 1 | 1 | 0 | PASSED | None |",
    );
  });

  it("[TEST-GOVERNANCE-014] rejects missing collection and project browser or lane mismatches", () => {
    const missing = reconcileCoverage(
      reconciliationOptions(
        createPlannedTestsManifest({
          commitSha,
          ciLane: CiLane.PULL_REQUEST,
          generatedAt,
          tests: [],
        }),
        createExecutedTestsManifest({
          commitSha,
          ciLane: CiLane.PULL_REQUEST,
          generatedAt,
          tests: [],
        }),
      ),
    );
    expect(missing.issues).toContain(
      "IDENTITY-001: IDENTITY-001-E2E was not collected in web:desktop",
    );

    const wrongTarget = reconcileCoverage(
      reconciliationOptions(
        createPlannedTestsManifest({
          commitSha,
          ciLane: CiLane.MAIN,
          generatedAt,
          tests: [
            collectedTest({
              project: "admin:desktop",
              browser: BrowserTarget.FIREFOX,
            }),
          ],
        }),
        executionManifest(TestExecutionStatus.PASSED),
      ),
    );
    expect(wrongTarget.issues).toEqual(
      expect.arrayContaining([
        "planned-tests.json lane MAIN does not match PULL_REQUEST",
        "IDENTITY-001: IDENTITY-001-E2E was collected in admin:desktop instead of web:desktop",
      ]),
    );

    const wrongBrowser = reconcileCoverage(
      reconciliationOptions(
        createPlannedTestsManifest({
          commitSha,
          ciLane: CiLane.PULL_REQUEST,
          generatedAt,
          tests: [collectedTest({ browser: BrowserTarget.FIREFOX })],
        }),
        executionManifest(TestExecutionStatus.PASSED, 0, {
          browser: BrowserTarget.FIREFOX,
        }),
      ),
    );
    expect(wrongBrowser.issues).toContain(
      "IDENTITY-001: IDENTITY-001-E2E browser is FIREFOX, expected CHROMIUM",
    );

    const wrongTags = reconcileCoverage(
      reconciliationOptions(
        createPlannedTestsManifest({
          commitSha,
          ciLane: CiLane.PULL_REQUEST,
          generatedAt,
          tests: [collectedTest({ tags: [] })],
        }),
        executionManifest(TestExecutionStatus.PASSED, 0, { tags: [] }),
      ),
    );
    expect(wrongTags.issues).toContain(
      "IDENTITY-001: IDENTITY-001-E2E tags are NONE, expected BROWSER",
    );
  });

  it("[TEST-GOVERNANCE-015] rejects failures unexpected skips and retry flakes", () => {
    const planned = createPlannedTestsManifest({
      commitSha,
      ciLane: CiLane.PULL_REQUEST,
      generatedAt,
      tests: [collectedTest()],
    });
    const failed = reconcileCoverage(
      reconciliationOptions(
        planned,
        executionManifest(TestExecutionStatus.FAILED),
      ),
    );
    expect(failed.issues).toContain(
      "IDENTITY-001: IDENTITY-001-E2E finished with FAILED",
    );

    const skipped = reconcileCoverage(
      reconciliationOptions(
        planned,
        executionManifest(TestExecutionStatus.SKIPPED),
      ),
    );
    expect(skipped.issues).toContain(
      "IDENTITY-001: IDENTITY-001-E2E was skipped without an active waiver",
    );

    const flaky = reconcileCoverage(
      reconciliationOptions(
        planned,
        createExecutedTestsManifest({
          commitSha,
          ciLane: CiLane.PULL_REQUEST,
          generatedAt,
          tests: [
            executionRecord(TestExecutionStatus.FAILED, 0),
            executionRecord(TestExecutionStatus.PASSED, 1),
          ],
        }),
      ),
    );
    expect(flaky.issues).toContain(
      "IDENTITY-001: IDENTITY-001-E2E is flaky in web:desktop",
    );

    const unplanned = reconcileCoverage(
      reconciliationOptions(
        planned,
        executionManifest(TestExecutionStatus.PASSED, 0, {
          caseId: "unplanned-case",
        }),
      ),
    );
    expect(unplanned.issues).toContain(
      "executed-tests.json contains an unplanned case: IDENTITY-001-E2E:PLAYWRIGHT:web:desktop:unplanned-case:1/1",
    );

    const missingFirstAttempt = reconcileCoverage(
      reconciliationOptions(
        planned,
        executionManifest(TestExecutionStatus.PASSED, 1),
      ),
    );
    expect(missingFirstAttempt.issues).toContain(
      "executed-tests.json attempts must be contiguous from zero: IDENTITY-001-E2E:PLAYWRIGHT:web:desktop:identity-register:1/1",
    );
  });

  it("[TEST-GOVERNANCE-016] accepts only an active explicit skip waiver", () => {
    const planned = createPlannedTestsManifest({
      commitSha,
      ciLane: CiLane.PULL_REQUEST,
      generatedAt,
      tests: [collectedTest()],
    });
    const active = reconcileCoverage({
      ...reconciliationOptions(
        planned,
        executionManifest(TestExecutionStatus.SKIPPED),
      ),
      waivers: waiverManifest("2026-08-17T00:00:00.000Z"),
    });
    expect(active.status).toBe(CoverageReconciliationStatus.WAIVED);
    expect(active.issues).toEqual([]);

    const expired = reconcileCoverage({
      ...reconciliationOptions(
        planned,
        executionManifest(TestExecutionStatus.SKIPPED),
      ),
      waivers: waiverManifest("2026-08-09T00:00:00.000Z"),
    });
    expect(expired.issues).toEqual(
      expect.arrayContaining([
        "Coverage waiver is expired or invalid: IDENTITY-001:IDENTITY-001-E2E:web:desktop:PULL_REQUEST",
        "IDENTITY-001: IDENTITY-001-E2E was skipped without an active waiver",
      ]),
    );

    const tooLong = reconcileCoverage({
      ...reconciliationOptions(
        planned,
        executionManifest(TestExecutionStatus.SKIPPED),
      ),
      waivers: waiverManifest("2026-08-18T00:00:00.001Z"),
    });
    expect(tooLong.issues).toContain(
      "Coverage waiver exceeds seven days: IDENTITY-001:IDENTITY-001-E2E:web:desktop:PULL_REQUEST",
    );
  });

  it("[TEST-GOVERNANCE-017] rejects SYSTEM evidence that writes through Prisma", () => {
    const base = browserEvidence();
    expect(
      validateSystemEvidenceSource(
        {
          ...base,
          layer: TestLayer.SYSTEM,
          path: "system.fixture.ts",
          testId: "SYSTEM-001",
          tags: [TestTag.SYSTEM],
        },
        repositoryRoot,
      ),
    ).toEqual([]);
    expect(
      validateSystemEvidenceSource(
        {
          ...base,
          layer: TestLayer.SYSTEM,
          path: "system-prisma.fixture.ts",
          testId: "SYSTEM-002",
          tags: [TestTag.SYSTEM],
        },
        repositoryRoot,
      ),
    ).toEqual([
      "SYSTEM-002: SYSTEM evidence must not write business state through Prisma",
    ]);
  });

  it("[TEST-GOVERNANCE-018] normalizes Vitest collection and execution JSON", () => {
    const file = resolve(repositoryRoot, "identity.integration.fixture.ts");
    const collected = normalizeVitestCollectedTests(
      [
        {
          name: "identity > IDENTITY-001-INTEGRATION returns the user",
          file,
        },
      ],
      { repositoryRoot, project: "@sylis/api" },
    );
    expect(collected).toEqual([
      expect.objectContaining({
        testId: "IDENTITY-001-INTEGRATION",
        project: "@sylis/api",
        path: "identity.integration.fixture.ts",
      }),
    ]);

    const executed = normalizeVitestExecutionReport(
      {
        testResults: [
          {
            name: file,
            assertionResults: [
              {
                ancestorTitles: ["identity"],
                fullName: "identity IDENTITY-001-INTEGRATION returns the user",
                title: "IDENTITY-001-INTEGRATION returns the user",
                status: "passed",
                duration: 12,
                failureMessages: null,
              },
            ],
          },
        ],
      },
      { repositoryRoot, project: "@sylis/api" },
    );
    expect(executed).toEqual([
      expect.objectContaining({
        testId: "IDENTITY-001-INTEGRATION",
        caseId: collected[0]?.caseId,
        title: collected[0]?.title,
        status: TestExecutionStatus.PASSED,
        durationMs: 12,
      }),
    ]);

    expect(
      validatePlannedTestsManifest({
        schemaVersion: 1,
        commitSha,
        ciLane: CiLane.PULL_REQUEST,
        generatedAt,
        tests: [{ ...collected[0], caseId: "" }],
      }),
    ).toContain(
      "planned-tests.json.tests[0].caseId must be a non-empty string",
    );
    expect(
      validateExecutedTestsManifest({
        schemaVersion: 1,
        commitSha,
        ciLane: CiLane.PULL_REQUEST,
        generatedAt,
        tests: [
          {
            ...executionRecord(TestExecutionStatus.PASSED),
            durationMs: -1,
          },
        ],
      }),
    ).toContain(
      "executed-tests.json.tests[0].durationMs must be a non-negative finite number",
    );
    expect(
      validateCoverageWaiverManifest({ schemaVersion: 1, waivers: [{}] }),
    ).toEqual(
      expect.arrayContaining([
        "coverage waivers.waivers[0].requirementId must be a non-empty string",
        "coverage waivers.waivers[0].allowedStatus must be SKIPPED",
      ]),
    );
  });
});

function browserEvidence(): CoverageManifest["requirements"][number]["evidence"][number] {
  return {
    layer: TestLayer.BROWSER_E2E,
    path: "registration.fixture.ts",
    testId: "IDENTITY-001-E2E",
    runner: TestRunner.PLAYWRIGHT,
    projects: ["web:desktop"],
    tags: [TestTag.BROWSER],
    ciLanes: [CiLane.PULL_REQUEST, CiLane.MAIN],
    behavior: "Registers a learner through the browser",
  };
}

function coverageManifest(): CoverageManifest {
  return {
    schemaVersion: 2,
    requirements: [
      {
        id: "IDENTITY-001",
        owner: CoverageOwner.IDENTITY,
        risk: RiskLevel.HIGH,
        requiredLayers: [TestLayer.BROWSER_E2E],
        ciLanes: [CiLane.PULL_REQUEST, CiLane.MAIN],
        evidence: [browserEvidence()],
      },
    ],
  };
}

function collectedTest(
  overrides: Partial<CollectedTestRecord> = {},
): CollectedTestRecord {
  return {
    testId: "IDENTITY-001-E2E",
    caseId: "identity-register",
    runner: TestRunner.PLAYWRIGHT,
    project: "web:desktop",
    path: "registration.fixture.ts",
    title: "IDENTITY-001-E2E a learner registers through the browser",
    tags: [TestTag.BROWSER],
    browser: BrowserTarget.CHROMIUM,
    shard: "1/1",
    ...overrides,
  };
}

function executionRecord(
  status: TestExecutionStatus,
  attempt = 0,
  overrides: Partial<CollectedTestRecord> = {},
) {
  return {
    ...collectedTest(overrides),
    attempt,
    status,
    durationMs: 100,
    artifactLinks: [],
  };
}

function executionManifest(
  status: TestExecutionStatus,
  attempt = 0,
  overrides: Partial<CollectedTestRecord> = {},
): ExecutedTestsManifest {
  return createExecutedTestsManifest({
    commitSha,
    ciLane: CiLane.PULL_REQUEST,
    generatedAt,
    tests: [executionRecord(status, attempt, overrides)],
  });
}

function reconciliationOptions(
  planned: ReturnType<typeof createPlannedTestsManifest>,
  executed: ExecutedTestsManifest,
) {
  return {
    manifest: coverageManifest(),
    planned,
    executed,
    waivers: { schemaVersion: 1 as const, waivers: [] },
    ciLane: CiLane.PULL_REQUEST,
    repositoryRoot,
    now: new Date("2026-08-10T00:00:00.000Z"),
  };
}

function waiverManifest(expiresAt: string): CoverageWaiverManifest {
  return {
    schemaVersion: 1,
    waivers: [
      {
        requirementId: "IDENTITY-001",
        testId: "IDENTITY-001-E2E",
        project: "web:desktop",
        ciLane: CiLane.PULL_REQUEST,
        owner: "identity-team",
        reason: "Temporary external accessibility review",
        expiresAt,
        allowedStatus: TestExecutionStatus.SKIPPED,
      },
    ],
  };
}
