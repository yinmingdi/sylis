import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import {
  CiLane,
  RiskLevel,
  TestLayer,
  TestRunner,
  TestTag,
} from "./test-contract";

export enum CoverageOwner {
  IDENTITY = "IDENTITY",
  LEARNING = "LEARNING",
  LEXICON = "LEXICON",
  AGENT = "AGENT",
  MODEL_EXECUTION = "MODEL_EXECUTION",
  CONTENT = "CONTENT",
  ADMIN = "ADMIN",
  DELIVERY = "DELIVERY",
  PLATFORM = "PLATFORM",
}

export interface CoverageEvidence {
  layer: TestLayer;
  path: string;
  testId: string;
  runner: TestRunner;
  projects: string[];
  tags: TestTag[];
  ciLanes: CiLane[];
  behavior: string;
}

export interface CoverageRequirement {
  id: string;
  owner: CoverageOwner;
  risk: RiskLevel;
  requiredLayers: TestLayer[];
  ciLanes: CiLane[];
  evidence: CoverageEvidence[];
}

export interface CoverageManifest {
  schemaVersion: 2;
  requirements: CoverageRequirement[];
}

export function validateCoverageManifest(manifest: unknown): string[] {
  const issues: string[] = [];

  if (!isRecord(manifest)) {
    return ["Coverage manifest must be an object"];
  }
  if (manifest.schemaVersion !== 2) {
    issues.push("Coverage manifest schemaVersion must be 2");
  }
  if (!Array.isArray(manifest.requirements)) {
    return [...issues, "Coverage manifest requirements must be an array"];
  }

  const seenIds = new Set<string>();
  for (const [index, value] of manifest.requirements.entries()) {
    if (!isRecord(value)) {
      issues.push(`Requirement at index ${index} must be an object`);
      continue;
    }

    const id = typeof value.id === "string" ? value.id : `#${index}`;
    if (!/^[A-Z][A-Z0-9_]*-[0-9]{3}$/.test(id)) {
      issues.push(`${id}: invalid requirement id`);
    }
    if (seenIds.has(id)) {
      issues.push(`Duplicate requirement id: ${id}`);
    }
    seenIds.add(id);

    if (!isEnumValue(CoverageOwner, value.owner)) {
      issues.push(`${id}: invalid owner ${String(value.owner)}`);
    }
    if (!isEnumValue(RiskLevel, value.risk)) {
      issues.push(`${id}: invalid risk ${String(value.risk)}`);
    }

    const requiredLayers = enumArray(TestLayer, value.requiredLayers);
    if (requiredLayers === null || requiredLayers.length === 0) {
      issues.push(`${id}: requiredLayers must contain valid TestLayer values`);
    }
    const ciLanes = enumArray(CiLane, value.ciLanes);
    if (ciLanes === null || ciLanes.length === 0) {
      issues.push(`${id}: ciLanes must contain valid CiLane values`);
    }
    const evidence = coverageEvidence(id, value.evidence, issues);

    if (ciLanes) {
      const evidencedLanes = new Set(evidence.flatMap((item) => item.ciLanes));
      for (const lane of ciLanes) {
        if (!evidencedLanes.has(lane)) {
          issues.push(`${id}: CI lane ${lane} has no evidence`);
        }
      }
      for (const item of evidence) {
        for (const lane of item.ciLanes) {
          if (!ciLanes.includes(lane)) {
            issues.push(
              `${id}: evidence ${item.testId} declares CI lane ${lane} outside the requirement`,
            );
          }
        }
      }
    }

    if (requiredLayers) {
      const evidencedLayers = new Set(evidence.map((item) => item.layer));
      for (const layer of requiredLayers) {
        if (!evidencedLayers.has(layer)) {
          issues.push(`${id}: required layer ${layer} has no evidence`);
        }
      }
    }

    if (value.risk === RiskLevel.CRITICAL) {
      if (
        !ciLanes?.includes(CiLane.PULL_REQUEST) ||
        !ciLanes.includes(CiLane.MAIN)
      ) {
        issues.push(
          `${id}: critical requirements must run in PULL_REQUEST and MAIN`,
        );
      }
      if (new Set(evidence.map((item) => item.layer)).size < 2) {
        issues.push(`${id}: critical requirements need two independent layers`);
      }
      if (
        !evidence.some(
          (item) =>
            item.layer === TestLayer.BROWSER_E2E ||
            item.layer === TestLayer.SYSTEM,
        )
      ) {
        issues.push(
          `${id}: critical requirements need BROWSER_E2E or SYSTEM evidence`,
        );
      }
    }
  }

  return issues;
}

export function validateCoverageEvidence(
  manifest: CoverageManifest,
  repositoryRoot: string,
): string[] {
  const issues: string[] = [];

  for (const requirement of manifest.requirements) {
    for (const evidence of requirement.evidence) {
      const evidencePath = resolve(repositoryRoot, evidence.path);
      if (!existsSync(evidencePath)) {
        issues.push(
          `${requirement.id}: evidence file does not exist: ${evidence.path}`,
        );
        continue;
      }

      const source = readFileSync(evidencePath, "utf8");
      if (!source.includes(evidence.testId)) {
        issues.push(
          `${requirement.id}: ${evidence.path} does not declare ${evidence.testId}`,
        );
      }
    }
  }

  return issues;
}

export function checkCoverageManifestFile(
  manifestPath: string,
  repositoryRoot: string,
): string[] {
  if (!existsSync(manifestPath)) {
    return [`Coverage manifest does not exist: ${basename(manifestPath)}`];
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return [`Coverage manifest is not valid JSON: ${basename(manifestPath)}`];
  }

  const structuralIssues = validateCoverageManifest(manifest);
  if (structuralIssues.length > 0) {
    return structuralIssues;
  }

  return validateCoverageEvidence(manifest as CoverageManifest, repositoryRoot);
}

export function renderCoverageManifestMarkdown(
  manifest: CoverageManifest,
): string {
  const requirements = [...manifest.requirements].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const riskCount = (risk: RiskLevel) =>
    requirements.filter((requirement) => requirement.risk === risk).length;
  const rows = requirements.map((requirement) => {
    const evidence = [...requirement.evidence]
      .sort(
        (left, right) =>
          left.layer.localeCompare(right.layer) ||
          left.path.localeCompare(right.path) ||
          left.testId.localeCompare(right.testId),
      )
      .map(
        (item) =>
          `${item.layer}: \`${item.testId}\` via ${item.runner} [${item.projects.join(", ")}] - ${item.behavior} (\`${item.path}\`)`,
      )
      .join("<br>");

    return `| ${requirement.id} | ${requirement.owner} | ${requirement.risk} | ${requirement.requiredLayers.join(", ")} | ${requirement.ciLanes.join(", ")} | ${evidence} |`;
  });

  return [
    "<!-- Generated by @sylis/test-support. Do not edit. -->",
    "# Automated Test Coverage",
    "",
    "Source of truth: `tests/coverage/requirements.json`.",
    "",
    `- Requirements: ${requirements.length}`,
    `- Risk: ${riskCount(RiskLevel.CRITICAL)} critical, ${riskCount(RiskLevel.HIGH)} high, ${riskCount(RiskLevel.STANDARD)} standard`,
    "",
    "| Requirement | Owner | Risk | Required layers | CI lanes | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

export function checkCoverageMarkdownFile(
  manifest: CoverageManifest,
  markdownPath: string,
): string[] {
  if (!existsSync(markdownPath)) {
    return [
      `Generated coverage report does not exist: ${basename(markdownPath)}`,
    ];
  }

  const expected = renderCoverageManifestMarkdown(manifest);
  if (readFileSync(markdownPath, "utf8") !== expected) {
    return [
      `Generated coverage report is out of date: ${basename(markdownPath)}`,
    ];
  }
  return [];
}

export function writeCoverageMarkdownFile(
  manifest: CoverageManifest,
  markdownPath: string,
): void {
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(markdownPath, renderCoverageManifestMarkdown(manifest), "utf8");
}

function coverageEvidence(
  requirementId: string,
  value: unknown,
  issues: string[],
): CoverageEvidence[] {
  if (!Array.isArray(value)) {
    issues.push(`${requirementId}: evidence must be an array`);
    return [];
  }

  const evidence: CoverageEvidence[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      issues.push(`${requirementId}: evidence ${index} must be an object`);
      continue;
    }
    if (!isEnumValue(TestLayer, item.layer)) {
      issues.push(
        `${requirementId}: evidence ${index} has invalid layer ${String(item.layer)}`,
      );
      continue;
    }
    if (!portablePath(item.path)) {
      issues.push(`${requirementId}: evidence ${index} has invalid path`);
      continue;
    }
    if (typeof item.testId !== "string" || item.testId.trim().length === 0) {
      issues.push(`${requirementId}: evidence ${index} has invalid testId`);
      continue;
    }
    if (!isEnumValue(TestRunner, item.runner)) {
      issues.push(
        `${requirementId}: evidence ${index} has invalid runner ${String(item.runner)}`,
      );
      continue;
    }
    const projects = stringArray(item.projects);
    if (projects === null || projects.length === 0) {
      issues.push(`${requirementId}: evidence ${index} has invalid projects`);
      continue;
    }
    const tags = enumArray(TestTag, item.tags);
    if (tags === null || tags.length === 0) {
      issues.push(`${requirementId}: evidence ${index} has invalid tags`);
      continue;
    }
    const ciLanes = enumArray(CiLane, item.ciLanes);
    if (ciLanes === null || ciLanes.length === 0) {
      issues.push(`${requirementId}: evidence ${index} has invalid ciLanes`);
      continue;
    }
    if (
      typeof item.behavior !== "string" ||
      item.behavior.trim().length === 0
    ) {
      issues.push(`${requirementId}: evidence ${index} has invalid behavior`);
      continue;
    }
    const semanticTag = requiredSemanticTag(item.layer);
    if (semanticTag && !tags.includes(semanticTag)) {
      issues.push(
        `${requirementId}: evidence ${index} layer ${item.layer} requires tag ${semanticTag}`,
      );
      continue;
    }
    evidence.push({
      layer: item.layer,
      path: item.path,
      testId: item.testId,
      runner: item.runner,
      projects,
      tags,
      ciLanes,
      behavior: item.behavior.trim(),
    });
  }
  return evidence;
}

function requiredSemanticTag(layer: TestLayer): TestTag | null {
  switch (layer) {
    case TestLayer.BROWSER_E2E:
      return TestTag.BROWSER;
    case TestLayer.SYSTEM:
      return TestTag.SYSTEM;
    case TestLayer.AI_EVAL:
      return TestTag.AI_EVAL;
    case TestLayer.SYNTHETIC:
      return TestTag.DEPLOYMENT;
    default:
      return null;
  }
}

function stringArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) =>
        typeof item === "string" &&
        /^[a-zA-Z0-9@:_./-]+$/.test(item) &&
        item.length > 0,
    )
  ) {
    return null;
  }
  return [...new Set(value)];
}

function portablePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !isAbsolute(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function enumArray<T extends Record<string, string>>(
  values: T,
  value: unknown,
): Array<T[keyof T]> | null {
  if (
    !Array.isArray(value) ||
    !value.every((item) => isEnumValue(values, item))
  ) {
    return null;
  }
  return [...new Set(value)] as Array<T[keyof T]>;
}

function isEnumValue<T extends Record<string, string>>(
  values: T,
  value: unknown,
): value is T[keyof T] {
  return typeof value === "string" && Object.values(values).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
