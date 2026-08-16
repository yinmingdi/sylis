import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export enum AccessibilityStandardTag {
  WCAG_2_A = "wcag2a",
  WCAG_2_AA = "wcag2aa",
  WCAG_21_A = "wcag21a",
  WCAG_21_AA = "wcag21aa",
  WCAG_22_AA = "wcag22aa",
}

const REQUIRED_STANDARD_TAGS = Object.values(AccessibilityStandardTag);

export async function expectNoAccessibilityViolations(
  page: Page,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(REQUIRED_STANDARD_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
}
