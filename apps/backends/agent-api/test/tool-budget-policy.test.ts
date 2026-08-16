import { describe, expect, it } from "vitest";

import {
  AgentToolBudgetRejectionCode,
  allocateToolCallBudget,
} from "../src/modules/agent/tool-budget-policy";

describe("Agent Tool budget policy", () => {
  it("settles excess calls in model order without rejecting the Step", () => {
    expect(
      allocateToolCallBudget({
        run: { used: 0, maximum: 2 },
        calls: [
          {
            actionId: "action-1",
            grantId: "grant-1",
            grantUsed: 0,
            grantMaximum: 4,
          },
          {
            actionId: "action-2",
            grantId: "grant-1",
            grantUsed: 0,
            grantMaximum: 4,
          },
          {
            actionId: "action-3",
            grantId: "grant-1",
            grantUsed: 0,
            grantMaximum: 4,
          },
        ],
      }),
    ).toEqual([
      { actionId: "action-1" },
      { actionId: "action-2" },
      {
        actionId: "action-3",
        rejectionCode: AgentToolBudgetRejectionCode.RUN_LIMIT_EXCEEDED,
      },
    ]);
  });

  it("tracks repeated calls against their shared Grant", () => {
    expect(
      allocateToolCallBudget({
        run: { used: 1, maximum: 8 },
        calls: [
          {
            actionId: "action-1",
            grantId: "grant-1",
            grantUsed: 1,
            grantMaximum: 2,
          },
          {
            actionId: "action-2",
            grantId: "grant-1",
            grantUsed: 1,
            grantMaximum: 2,
          },
        ],
      }),
    ).toEqual([
      { actionId: "action-1" },
      {
        actionId: "action-2",
        rejectionCode: AgentToolBudgetRejectionCode.GRANT_EXHAUSTED,
      },
    ]);
  });
});
