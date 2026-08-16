import { OperatorRole } from "@sylis/database";
import { expect, test } from "@playwright/test";

import { adminUrl, loginOperator } from "../../fixtures/operator";
import { TestTag, e2eTags } from "../../runtime";

interface AdminControlBoundary {
  path: string;
  allowedRoles: readonly OperatorRole[];
}

const controlBoundaries: readonly AdminControlBoundary[] = [
  {
    path: "/api/admin/v1/user-support/users?query=missing-user",
    allowedRoles: [OperatorRole.SUPPORT, OperatorRole.SECURITY_ADMIN],
  },
  {
    path: "/api/admin/v1/reviews/batches",
    allowedRoles: [OperatorRole.CONTENT_REVIEWER],
  },
  {
    path: "/api/admin/v1/source-datasets",
    allowedRoles: [OperatorRole.LEXICON_OPERATOR],
  },
  {
    path: "/api/admin/v1/lexicon/releases/missing/activation-preview",
    allowedRoles: [OperatorRole.RELEASE_MANAGER],
  },
  {
    path: "/api/admin/v1/models/usage",
    allowedRoles: [OperatorRole.MODEL_OPERATOR],
  },
  {
    path: "/api/admin/v1/agents/releases",
    allowedRoles: [
      OperatorRole.AGENT_RELEASE_MANAGER,
      OperatorRole.SECURITY_ADMIN,
    ],
  },
  {
    path: "/api/admin/v1/audit/retention",
    allowedRoles: [OperatorRole.SECURITY_ADMIN],
  },
];

test(
  "ADMIN-001-E2E the Admin control plane rejects an unauthenticated operator",
  {
    tag: e2eTags(TestTag.BROWSER, TestTag.SECURITY),
  },
  async ({ page, request }) => {
    await page.goto(adminUrl("/agent/runs"));
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "Sylis Admin" }),
    ).toBeVisible();

    const response = await request.get(adminUrl("/api/admin/v1/agents/runs"));
    expect([401, 403]).toContain(response.status());
  },
);

for (const role of Object.values(OperatorRole)) {
  test(
    `ADMIN-012-SYSTEM ${role} is constrained by the complete Admin control-domain matrix`,
    {
      tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
    },
    async ({ page }) => {
      await loginOperator(page, role);
      for (const boundary of controlBoundaries) {
        const response = await page.request.get(adminUrl(boundary.path));
        if (boundary.allowedRoles.includes(role)) {
          expect(
            response.status(),
            `${role} was rejected from ${boundary.path}`,
          ).not.toBe(403);
        } else {
          expect(response.status(), `${role} entered ${boundary.path}`).toBe(
            403,
          );
        }
      }
    },
  );
}
