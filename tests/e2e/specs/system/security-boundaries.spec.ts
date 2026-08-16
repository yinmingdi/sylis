import { createHash } from "node:crypto";

import { AssetMimeType } from "@sylis/agent-contracts";
import { ContentAssetPurpose } from "@sylis/database";
import { DataExportCategory } from "@sylis/job-contracts";

import {
  authenticatedMutationHeaders,
  registerUserViaApi,
} from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2ePorts, e2eTags } from "../../runtime";

test(
  "AUTHORIZATION-001-SYSTEM user-owned resources and session audiences are isolated",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ browser, learnerPage: ownerPage, namespace, operatorPage }) => {
    const ownerHeaders = await authenticatedMutationHeaders(ownerPage);
    const notebookResponse = await ownerPage.request.post("/api/v1/notebooks", {
      headers: ownerHeaders,
      data: { name: `Owner notebook ${namespace.value}` },
    });
    expect(notebookResponse.ok()).toBeTruthy();
    const notebook = (await notebookResponse.json()) as { id: string };

    const agentSessionResponse = await ownerPage.request.post(
      "/api/agent/v1/sessions",
      {
        headers: ownerHeaders,
        data: { title: `Owner session ${namespace.value}` },
      },
    );
    expect(agentSessionResponse.ok()).toBeTruthy();
    const agentSession = (await agentSessionResponse.json()) as { id: string };

    const ownerSessionResponse = await ownerPage.request.get(
      "/api/v1/auth/session",
    );
    expect(ownerSessionResponse.ok()).toBeTruthy();
    const ownerSession = (await ownerSessionResponse.json()) as {
      session: { id: string };
    };

    const body = Buffer.from("Object authorization fixture.\n");
    const uploadIntentResponse = await ownerPage.request.post(
      "/api/agent/v1/assets/upload-intents",
      {
        headers: ownerHeaders,
        data: {
          filename: "owner-only.txt",
          byteSize: body.byteLength,
          contentHash: createHash("sha256").update(body).digest("hex"),
          mimeType: AssetMimeType.TEXT_PLAIN,
          purpose: ContentAssetPurpose.AGENT_CONTEXT,
        },
      },
    );
    expect(uploadIntentResponse.ok()).toBeTruthy();
    const asset = (await uploadIntentResponse.json()) as { assetId: string };

    const attackerContext = await browser.newContext({
      baseURL: `http://127.0.0.1:${e2ePorts().web}`,
    });
    try {
      const attackerPage = await attackerContext.newPage();
      await registerUserViaApi(attackerPage, namespace, "object-attacker");
      const attackerHeaders = await authenticatedMutationHeaders(attackerPage);

      for (const path of [
        `/api/v1/notebooks/${notebook.id}`,
        `/api/agent/v1/sessions/${agentSession.id}`,
        `/api/agent/v1/assets/${asset.assetId}`,
      ]) {
        const response = await attackerPage.request.get(path);
        expect(response.status(), path).toBe(404);
      }

      const revokeOwnerSession = await attackerPage.request.delete(
        `/api/v1/users/me/sessions/${ownerSession.session.id}`,
        { headers: attackerHeaders },
      );
      expect(revokeOwnerSession.status()).toBe(404);

      const userToAdmin = await attackerPage.request.get(
        `http://127.0.0.1:${e2ePorts().adminApi}/api/admin/v1/overview`,
      );
      expect([401, 403]).toContain(userToAdmin.status());
    } finally {
      await attackerContext.close();
    }

    for (const url of [
      `http://127.0.0.1:${e2ePorts().api}/api/v1/users/me`,
      `http://127.0.0.1:${e2ePorts().agentApi}/api/agent/v1/sessions`,
    ]) {
      const response = await operatorPage.request.get(url);
      expect([401, 403], url).toContain(response.status());
    }
  },
);

test(
  "IDEMPOTENCY-001-SYSTEM concurrent replay is stable and key reuse with another payload conflicts",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const idempotencyKey = namespace.idempotencyKey("concurrent-data-export");
    const requestExport = (scope: readonly DataExportCategory[]) =>
      page.request.post("/api/v1/users/me/data-exports", {
        headers: { ...headers, "Idempotency-Key": idempotencyKey },
        data: { scope },
      });

    const [left, right] = await Promise.all([
      requestExport([DataExportCategory.PROFILE]),
      requestExport([DataExportCategory.PROFILE]),
    ]);
    expect(left.ok()).toBeTruthy();
    expect(right.ok()).toBeTruthy();
    const [leftResult, rightResult] = (await Promise.all([
      left.json(),
      right.json(),
    ])) as Array<{ requestId: string; jobId: string }>;
    expect(rightResult).toEqual(leftResult);

    const conflict = await requestExport([DataExportCategory.NOTEBOOKS]);
    expect(conflict.status()).toBe(409);
    await expect(conflict.text()).resolves.toContain(
      "IDEMPOTENCY_KEY_INPUT_CONFLICT",
    );
  },
);
