import { describe, expect, it } from "vitest";

import {
  BrowserTarget,
  CiLane,
  DeterministicIdFactory,
  FixedClock,
  RiskLevel,
  TestLayer,
  TestRunner,
  TestTag,
  createTestNamespace,
} from "../src";

describe("test support contract", () => {
  it("[TEST-PLATFORM-001] uses stable enum values in coverage manifests and CI filters", () => {
    expect(TestLayer.BROWSER_E2E).toBe("BROWSER_E2E");
    expect(TestLayer.AI_EVAL).toBe("AI_EVAL");
    expect(TestRunner.PLAYWRIGHT).toBe("PLAYWRIGHT");
    expect(TestTag.SYSTEM).toBe("SYSTEM");
    expect(RiskLevel.CRITICAL).toBe("CRITICAL");
    expect(CiLane.PULL_REQUEST).toBe("PULL_REQUEST");
    expect(BrowserTarget.CHROMIUM).toBe("CHROMIUM");
  });

  it("creates the same portable namespace for the same test identity", () => {
    expect(createTestNamespace("User registration", 3)).toBe(
      "user-registration-3",
    );
    expect(createTestNamespace("  USER_registration  ", 3)).toBe(
      "user-registration-3",
    );
  });

  it("rejects identities that cannot produce an isolated namespace", () => {
    expect(() => createTestNamespace("***", 1)).toThrow(
      "Test identity must contain letters or numbers",
    );
    expect(() => createTestNamespace("registration", -1)).toThrow(
      "Test sequence must be a non-negative integer",
    );
  });

  it("[TEST-PLATFORM-002] controls time without changing the process clock", () => {
    const clock = new FixedClock("2026-08-08T00:00:00.000Z");

    expect(clock.now().toISOString()).toBe("2026-08-08T00:00:00.000Z");
    expect(clock.advance(1_500).toISOString()).toBe("2026-08-08T00:00:01.500Z");
    expect(clock.now().toISOString()).toBe("2026-08-08T00:00:01.500Z");
  });

  it("creates stable isolated ids from a scenario seed", () => {
    const firstRun = new DeterministicIdFactory("registration");
    const replay = new DeterministicIdFactory("registration");

    expect(firstRun.next("user")).toBe(replay.next("user"));
    expect(firstRun.next("user")).not.toBe(replay.next("session"));
    expect(firstRun.next("attempt")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
