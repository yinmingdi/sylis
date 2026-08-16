import {
  ContentDeletionStatus,
  JobOwnerType,
  JobStatus,
} from "@sylis/database";

import {
  authenticatedMutationHeaders,
  registerUserViaApi,
} from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2ePorts, e2eTags } from "../../runtime";

test(
  "RETENTION-001-SYSTEM account deletion hides access immediately and purges identifiable content at the policy boundary",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY, TestTag.NIGHTLY),
  },
  async ({ browser, namespace, operatorPage }) => {
    const context = await browser.newContext({
      baseURL: `http://127.0.0.1:${e2ePorts().web}`,
    });
    try {
      const page = await context.newPage();
      const account = await registerUserViaApi(page, namespace, "retention");
      let headers = await authenticatedMutationHeaders(page);

      const notebook = await page.request.post("/api/v1/notebooks", {
        headers,
        data: { name: `Retention notebook ${namespace.value}` },
      });
      expect(notebook.ok()).toBeTruthy();
      const agentSession = await page.request.post("/api/agent/v1/sessions", {
        headers,
        data: { title: `Retention session ${namespace.value}` },
      });
      expect(agentSession.ok()).toBeTruthy();

      const reauthentication = await page.request.post(
        "/api/v1/auth/session/re-authentication",
        { headers, data: { password: account.password } },
      );
      expect(reauthentication.ok()).toBeTruthy();
      headers = await authenticatedMutationHeaders(page);

      const deletion = await page.request.post(
        "/api/v1/users/me/deletion-requests",
        {
          headers: {
            ...headers,
            "Idempotency-Key": namespace.idempotencyKey("account-deletion"),
          },
        },
      );
      expect(deletion.ok()).toBeTruthy();
      const request = (await deletion.json()) as {
        requestId: string;
        status: ContentDeletionStatus;
        hiddenAt: string;
        purgeAfter: string;
      };
      expect(request.status).toBe(ContentDeletionStatus.QUEUED);
      expect(new Date(request.purgeAfter).getTime()).toBeGreaterThanOrEqual(
        new Date(request.hiddenAt).getTime(),
      );

      expect((await page.request.get("/api/v1/auth/session")).status()).toBe(
        401,
      );
      const relogin = await page.request.post("/api/v1/auth/sessions", {
        data: { email: account.email, password: account.password },
      });
      expect(relogin.status()).toBe(401);

      await expect
        .poll(
          async () => {
            const jobsResponse =
              await operatorPage.request.get("/api/admin/v1/jobs");
            if (!jobsResponse.ok()) return jobsResponse.status();
            const jobs = (await jobsResponse.json()) as Array<{
              ownerType: JobOwnerType;
              ownerId: string;
              status: JobStatus;
            }>;
            return jobs.find(
              (job) =>
                job.ownerType === JobOwnerType.RETENTION_REQUEST &&
                job.ownerId === request.requestId,
            )?.status;
          },
          { timeout: 60_000 },
        )
        .toBe(JobStatus.SUCCEEDED);

      const userSearch = await operatorPage.request.get(
        `/api/admin/v1/user-support/users?query=${encodeURIComponent(account.email)}`,
      );
      expect(userSearch.ok()).toBeTruthy();
      expect(await userSearch.json()).toEqual([]);
    } finally {
      await context.close();
    }
  },
);
