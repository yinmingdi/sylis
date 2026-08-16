import { expect, test } from "@playwright/test";
import {
  AdminOperatorRole,
  AdminSessionAudience,
  AdminSessionAuthStrength,
  type AdminSessionView,
} from "@sylis/api-client/admin";

import { adminUrl, loginOperator } from "../../fixtures/operator";
import { TestTag, e2eTags } from "../../runtime";

test(
  "ADMIN-002-E2E an MFA-authenticated operator receives the seeded enum roles",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ page }) => {
    await loginOperator(page);

    const sessionResponse = await page.request.get(
      adminUrl("/api/admin/v1/auth/session"),
    );
    expect(sessionResponse.ok()).toBeTruthy();
    const session = (await sessionResponse.json()) as AdminSessionView;
    expect(session.csrfToken).toBeTruthy();
    expect(session.actor.id).toBeTruthy();
    expect(session.session.audience).toBe(AdminSessionAudience.ADMIN);
    expect(session.session.authStrength).toBe(
      AdminSessionAuthStrength.PASSWORD_MFA,
    );
    expect(new Date(session.session.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(session.roles).toEqual(
      expect.arrayContaining([
        AdminOperatorRole.SECURITY_ADMIN,
        AdminOperatorRole.RELEASE_MANAGER,
        AdminOperatorRole.MODEL_OPERATOR,
        AdminOperatorRole.AGENT_RELEASE_MANAGER,
      ]),
    );

    const operatorsResponse = await page.request.get(
      adminUrl("/api/admin/v1/operator-roles"),
    );
    expect(operatorsResponse.ok()).toBeTruthy();
    const operators = (await operatorsResponse.json()) as Array<{
      displayName: string;
      roles: Array<{ role: string }>;
    }>;
    expect(operators).toContainEqual(
      expect.objectContaining({
        displayName: "Sylis E2E Operator",
        roles: expect.arrayContaining([
          expect.objectContaining({ role: "SECURITY_ADMIN" }),
        ]),
      }),
    );
  },
);
