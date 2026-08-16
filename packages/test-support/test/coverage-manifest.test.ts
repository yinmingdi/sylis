import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CiLane,
  type CoverageEvidence,
  CoverageOwner,
  RiskLevel,
  TestLayer,
  TestRunner,
  TestTag,
  checkCoverageManifestFile,
  checkCoverageMarkdownFile,
  renderCoverageManifestMarkdown,
  validateCoverageEvidence,
  validateCoverageManifest,
} from "../src";

describe("coverage manifest", () => {
  it("[TEST-GOVERNANCE-001] accepts independently evidenced critical behavior", () => {
    const issues = validateCoverageManifest({
      schemaVersion: 2,
      requirements: [
        {
          id: "IDENTITY-001",
          owner: CoverageOwner.IDENTITY,
          risk: RiskLevel.CRITICAL,
          requiredLayers: [TestLayer.INTEGRATION, TestLayer.BROWSER_E2E],
          ciLanes: [CiLane.PULL_REQUEST, CiLane.MAIN],
          evidence: [
            coverageEvidence({
              layer: TestLayer.INTEGRATION,
              path: "apps/backends/api/test/identity.integration.test.ts",
              testId: "IDENTITY-001-INTEGRATION",
            }),
            coverageEvidence({
              layer: TestLayer.BROWSER_E2E,
              path: "tests/e2e/specs/user/registration.spec.ts",
              testId: "IDENTITY-001-E2E",
              runner: TestRunner.PLAYWRIGHT,
              projects: ["web:desktop"],
              tags: [TestTag.BROWSER],
            }),
          ],
        },
      ],
    });

    expect(issues).toEqual([]);
  });

  it("rejects missing layers, duplicate ids, and invalid enum values", () => {
    const issues = validateCoverageManifest({
      schemaVersion: 2,
      requirements: [
        {
          id: "IDENTITY-001",
          owner: CoverageOwner.IDENTITY,
          risk: RiskLevel.CRITICAL,
          requiredLayers: [TestLayer.INTEGRATION, TestLayer.BROWSER_E2E],
          ciLanes: [CiLane.MAIN],
          evidence: [
            coverageEvidence({
              layer: TestLayer.INTEGRATION,
              path: "identity.integration.test.ts",
              testId: "IDENTITY-001-INTEGRATION",
            }),
          ],
        },
        {
          id: "IDENTITY-001",
          owner: "UNKNOWN",
          risk: RiskLevel.STANDARD,
          requiredLayers: [TestLayer.UNIT],
          ciLanes: [CiLane.PULL_REQUEST],
          evidence: [],
        },
      ],
    });

    expect(issues).toContain("Duplicate requirement id: IDENTITY-001");
    expect(issues).toContain(
      "IDENTITY-001: required layer BROWSER_E2E has no evidence",
    );
    expect(issues).toContain(
      "IDENTITY-001: critical requirements must run in PULL_REQUEST and MAIN",
    );
    expect(issues).toContain("IDENTITY-001: invalid owner UNKNOWN");
  });

  it("[TEST-GOVERNANCE-002] verifies evidence against repository files", () => {
    const repoRoot = resolve(import.meta.dirname, "fixtures/repository");
    const requirement = {
      id: "IDENTITY-001",
      owner: CoverageOwner.IDENTITY,
      risk: RiskLevel.CRITICAL,
      requiredLayers: [TestLayer.INTEGRATION, TestLayer.BROWSER_E2E],
      ciLanes: [CiLane.PULL_REQUEST, CiLane.MAIN],
      evidence: [
        coverageEvidence({
          layer: TestLayer.INTEGRATION,
          path: "identity.integration.fixture.ts",
          testId: "IDENTITY-001-INTEGRATION",
        }),
        coverageEvidence({
          layer: TestLayer.BROWSER_E2E,
          path: "registration.fixture.ts",
          testId: "IDENTITY-001-E2E",
          runner: TestRunner.PLAYWRIGHT,
          projects: ["web:desktop"],
          tags: [TestTag.BROWSER],
        }),
      ],
    };

    expect(
      validateCoverageEvidence(
        { schemaVersion: 2, requirements: [requirement] },
        repoRoot,
      ),
    ).toEqual([]);

    expect(
      validateCoverageEvidence(
        {
          schemaVersion: 2,
          requirements: [
            {
              ...requirement,
              evidence: [
                { ...requirement.evidence[0], testId: "MISSING-ID" },
                { ...requirement.evidence[1], path: "missing.spec.ts" },
              ],
            },
          ],
        },
        repoRoot,
      ),
    ).toEqual([
      "IDENTITY-001: identity.integration.fixture.ts does not declare MISSING-ID",
      "IDENTITY-001: evidence file does not exist: missing.spec.ts",
    ]);
  });

  it("[TEST-GOVERNANCE-003] checks a persisted manifest through one public entrypoint", () => {
    const fixturesRoot = resolve(import.meta.dirname, "fixtures");

    expect(
      checkCoverageManifestFile(
        resolve(fixturesRoot, "coverage.valid.json"),
        resolve(fixturesRoot, "repository"),
      ),
    ).toEqual([]);
    expect(
      checkCoverageManifestFile(
        resolve(fixturesRoot, "coverage.invalid.json"),
        resolve(fixturesRoot, "repository"),
      ),
    ).toEqual(["Coverage manifest is not valid JSON: coverage.invalid.json"]);
    expect(
      checkCoverageManifestFile(
        resolve(fixturesRoot, "missing.json"),
        resolve(fixturesRoot, "repository"),
      ),
    ).toEqual(["Coverage manifest does not exist: missing.json"]);
  });

  it("[TEST-GOVERNANCE-004] renders a deterministic human-readable coverage report", () => {
    const markdown = renderCoverageManifestMarkdown({
      schemaVersion: 2,
      requirements: [
        {
          id: "IDENTITY-001",
          owner: CoverageOwner.IDENTITY,
          risk: RiskLevel.CRITICAL,
          requiredLayers: [TestLayer.INTEGRATION, TestLayer.BROWSER_E2E],
          ciLanes: [CiLane.PULL_REQUEST, CiLane.MAIN],
          evidence: [
            coverageEvidence({
              layer: TestLayer.BROWSER_E2E,
              path: "tests/e2e/specs/user/registration.spec.ts",
              testId: "IDENTITY-001-E2E",
              runner: TestRunner.PLAYWRIGHT,
              projects: ["web:desktop"],
              tags: [TestTag.BROWSER],
              behavior: "Registers through the delivered email challenge",
            }),
            coverageEvidence({
              layer: TestLayer.INTEGRATION,
              path: "apps/backends/api/test/identity.integration.test.ts",
              testId: "IDENTITY-001-INTEGRATION",
              behavior: "Persists an identity registration transaction",
            }),
          ],
        },
      ],
    });

    expect(markdown)
      .toBe(`<!-- Generated by @sylis/test-support. Do not edit. -->
# Automated Test Coverage

Source of truth: \`tests/coverage/requirements.json\`.

- Requirements: 1
- Risk: 1 critical, 0 high, 0 standard

| Requirement | Owner | Risk | Required layers | CI lanes | Evidence |
| --- | --- | --- | --- | --- | --- |
| IDENTITY-001 | IDENTITY | CRITICAL | INTEGRATION, BROWSER_E2E | PULL_REQUEST, MAIN | BROWSER_E2E: \`IDENTITY-001-E2E\` via PLAYWRIGHT [web:desktop] - Registers through the delivered email challenge (\`tests/e2e/specs/user/registration.spec.ts\`)<br>INTEGRATION: \`IDENTITY-001-INTEGRATION\` via VITEST [@sylis/test-support] - Persists an identity registration transaction (\`apps/backends/api/test/identity.integration.test.ts\`) |
`);
  });

  it("[TEST-GOVERNANCE-005] rejects missing or manually edited generated coverage", () => {
    const directory = mkdtempSync(join(tmpdir(), "sylis-test-coverage-"));
    const markdownPath = join(directory, "test-coverage.md");
    const manifest = {
      schemaVersion: 2 as const,
      requirements: [
        {
          id: "DELIVERY-001",
          owner: CoverageOwner.DELIVERY,
          risk: RiskLevel.STANDARD,
          requiredLayers: [TestLayer.UNIT],
          ciLanes: [CiLane.PULL_REQUEST],
          evidence: [
            coverageEvidence({
              layer: TestLayer.UNIT,
              path: "packages/test-support/test/coverage-manifest.test.ts",
              testId: "TEST-GOVERNANCE-005",
            }),
          ],
        },
      ],
    };

    expect(checkCoverageMarkdownFile(manifest, markdownPath)).toEqual([
      "Generated coverage report does not exist: test-coverage.md",
    ]);

    writeFileSync(markdownPath, "manually edited\n", "utf8");
    expect(checkCoverageMarkdownFile(manifest, markdownPath)).toEqual([
      "Generated coverage report is out of date: test-coverage.md",
    ]);
  });

  it("[TEST-GOVERNANCE-010] rejects incomplete execution metadata and semantic tags", () => {
    const issues = validateCoverageManifest({
      schemaVersion: 2,
      requirements: [
        {
          id: "IDENTITY-001",
          owner: CoverageOwner.IDENTITY,
          risk: RiskLevel.HIGH,
          requiredLayers: [TestLayer.BROWSER_E2E],
          ciLanes: [CiLane.PULL_REQUEST],
          evidence: [
            {
              layer: TestLayer.BROWSER_E2E,
              path: "tests/e2e/specs/user/registration.spec.ts",
              testId: "IDENTITY-001-E2E",
              runner: TestRunner.PLAYWRIGHT,
              projects: ["web:desktop"],
              tags: [TestTag.CORE],
              ciLanes: [CiLane.PULL_REQUEST],
              behavior: "Registers a learner",
            },
          ],
        },
      ],
    });

    expect(issues).toContain(
      "IDENTITY-001: evidence 0 layer BROWSER_E2E requires tag BROWSER",
    );
  });

  it("[TEST-GOVERNANCE-011] rejects evidence assigned outside the requirement CI lanes", () => {
    const issues = validateCoverageManifest({
      schemaVersion: 2,
      requirements: [
        {
          id: "DELIVERY-001",
          owner: CoverageOwner.DELIVERY,
          risk: RiskLevel.STANDARD,
          requiredLayers: [TestLayer.UNIT],
          ciLanes: [CiLane.PULL_REQUEST],
          evidence: [
            coverageEvidence({
              layer: TestLayer.UNIT,
              path: "packages/test-support/test/coverage-manifest.test.ts",
              testId: "TEST-GOVERNANCE-011",
              ciLanes: [CiLane.PULL_REQUEST, CiLane.NIGHTLY],
            }),
          ],
        },
      ],
    });

    expect(issues).toContain(
      "DELIVERY-001: evidence TEST-GOVERNANCE-011 declares CI lane NIGHTLY outside the requirement",
    );
  });
});

function coverageEvidence(
  overrides: Pick<CoverageEvidence, "layer" | "path" | "testId"> &
    Partial<Omit<CoverageEvidence, "layer" | "path" | "testId">>,
): CoverageEvidence {
  return {
    runner: TestRunner.VITEST,
    projects: ["@sylis/test-support"],
    tags: [TestTag.CORE],
    ciLanes: [CiLane.PULL_REQUEST, CiLane.MAIN],
    behavior: "Exercises the declared requirement behavior",
    ...overrides,
  };
}
