import { createHash } from "node:crypto";

import { AssetMimeType } from "@sylis/agent-contracts";
import {
  ContentAssetPurpose,
  ContentAssetRevisionStatus,
  ContentAssetStatus,
} from "@sylis/database";

import { authenticatedMutationHeaders } from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

test(
  "CONTENT-001-E2E a quarantined upload is scanned, indexed, made ready, and hidden on deletion",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ learnerPage: page }) => {
    const headers = await authenticatedMutationHeaders(page);
    const body = Buffer.from(
      "Sylis deterministic asset context for bank and run.\n",
    );
    const contentHash = createHash("sha256").update(body).digest("hex");

    const intentResponse = await page.request.post(
      "/api/agent/v1/assets/upload-intents",
      {
        headers,
        data: {
          filename: "e2e-context.txt",
          byteSize: body.byteLength,
          contentHash,
          mimeType: AssetMimeType.TEXT_PLAIN,
          purpose: ContentAssetPurpose.AGENT_CONTEXT,
        },
      },
    );
    expect(intentResponse.ok()).toBeTruthy();
    const intent = (await intentResponse.json()) as {
      assetId: string;
      intentId: string;
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
    };

    const uploadResponse = await page.request.put(intent.uploadUrl, {
      headers: intent.requiredHeaders,
      data: body,
    });
    expect(uploadResponse.ok()).toBeTruthy();

    const finalizeResponse = await page.request.post(
      `/api/agent/v1/assets/${intent.assetId}/finalize`,
      { headers, data: { intentId: intent.intentId } },
    );
    expect(finalizeResponse.ok()).toBeTruthy();
    const finalized = (await finalizeResponse.json()) as {
      revisionId: string;
      status: string;
    };
    expect(finalized.status).toBe("PROCESSING");

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/agent/v1/assets/${intent.assetId}`,
          );
          if (!response.ok()) return response.status();
          return ((await response.json()) as { status: string }).status;
        },
        { timeout: 90_000 },
      )
      .toBe(ContentAssetStatus.READY);
    const assetResponse = await page.request.get(
      `/api/agent/v1/assets/${intent.assetId}`,
    );
    expect(assetResponse.ok()).toBeTruthy();
    const asset = (await assetResponse.json()) as {
      revisions: Array<{ id: string; status: string }>;
    };
    expect(asset.revisions).toContainEqual(
      expect.objectContaining({
        id: finalized.revisionId,
        status: ContentAssetRevisionStatus.READY,
      }),
    );

    const revisionResponse = await page.request.get(
      `/api/agent/v1/assets/${intent.assetId}/revisions/${finalized.revisionId}`,
    );
    expect(revisionResponse.ok()).toBeTruthy();
    const revision = (await revisionResponse.json()) as {
      derivatives: Array<{ kind: string }>;
    };
    expect(revision.derivatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "EXTRACTED_TEXT" }),
        expect.objectContaining({ kind: "LEXICAL_INDEX" }),
      ]),
    );

    const deletionResponse = await page.request.delete(
      `/api/agent/v1/assets/${intent.assetId}`,
      { headers },
    );
    expect(deletionResponse.ok()).toBeTruthy();
    expect(
      (
        await page.request.get(`/api/agent/v1/assets/${intent.assetId}`)
      ).status(),
    ).toBe(404);
  },
);

test(
  "CONTENT-002-E2E a known malware sample remains quarantined and is rejected",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ learnerPage: page }) => {
    const headers = await authenticatedMutationHeaders(page);
    const body = Buffer.from(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    );
    const contentHash = createHash("sha256").update(body).digest("hex");
    const intentResponse = await page.request.post(
      "/api/agent/v1/assets/upload-intents",
      {
        headers,
        data: {
          filename: "eicar.txt",
          byteSize: body.byteLength,
          contentHash,
          mimeType: AssetMimeType.TEXT_PLAIN,
          purpose: ContentAssetPurpose.AGENT_CONTEXT,
        },
      },
    );
    expect(intentResponse.ok()).toBeTruthy();
    const intent = (await intentResponse.json()) as {
      assetId: string;
      intentId: string;
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
    };
    expect(
      (
        await page.request.put(intent.uploadUrl, {
          headers: intent.requiredHeaders,
          data: body,
        })
      ).ok(),
    ).toBeTruthy();
    const finalizeResponse = await page.request.post(
      `/api/agent/v1/assets/${intent.assetId}/finalize`,
      { headers, data: { intentId: intent.intentId } },
    );
    expect(finalizeResponse.ok()).toBeTruthy();
    const finalized = (await finalizeResponse.json()) as { revisionId: string };

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/agent/v1/assets/${intent.assetId}`,
          );
          if (!response.ok()) return response.status();
          return ((await response.json()) as { status: ContentAssetStatus })
            .status;
        },
        { timeout: 90_000 },
      )
      .toBe(ContentAssetStatus.REJECTED);
    const revisionResponse = await page.request.get(
      `/api/agent/v1/assets/${intent.assetId}/revisions/${finalized.revisionId}`,
    );
    expect(revisionResponse.ok()).toBeTruthy();
    expect(
      (
        (await revisionResponse.json()) as {
          status: ContentAssetRevisionStatus;
        }
      ).status,
    ).toBe(ContentAssetRevisionStatus.REJECTED);
  },
);
