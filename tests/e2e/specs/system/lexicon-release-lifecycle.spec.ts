import {
  ApprovalDecisionKind,
  ApprovalRequestStatus,
  LexiconReleaseStatus,
} from "@sylis/database";
import { type APIRequestContext, type APIResponse } from "@playwright/test";

import { adminUrl, operatorMutationHeaders } from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

interface ActivationPreview {
  releaseId: string;
  fromReleaseId: string | null;
  contentHash: string;
  status: LexiconReleaseStatus;
  actionDigest: string;
}

test(
  "RELEASE-001-E2E a validated lexicon release can be activated and rolled back",
  {
    tag: e2eTags(TestTag.SYSTEM),
  },
  async ({ operatorPage: page }) => {
    const headers = await operatorMutationHeaders(page);
    const releasesResponse = await page.request.get(
      adminUrl("/api/admin/v1/lexicon/releases"),
    );
    await expectOk(releasesResponse, "list Lexicon releases");
    const releases = (await releasesResponse.json()) as Array<{
      id: string;
      status: LexiconReleaseStatus;
      validationSummary: { lifecycleFixture?: boolean };
      lexicon: { key: string; activeReleaseId: string | null };
    }>;
    const candidate = releases.find(
      (release) => release.validationSummary.lifecycleFixture === true,
    );
    expect(candidate).toBeDefined();
    expect(candidate!.status).toBe(LexiconReleaseStatus.VALIDATED);
    const originalReleaseId = candidate!.lexicon.activeReleaseId;
    expect(originalReleaseId).toBeTruthy();

    const activation = await activate(
      page.request,
      headers,
      candidate!.id,
      "Exercise the E2E activation path",
    );
    expect(activation).toMatchObject({
      fromReleaseId: originalReleaseId,
      toReleaseId: candidate!.id,
    });
    await expectActiveRelease(
      page.request,
      candidate!.lexicon.key,
      candidate!.id,
    );

    const rollback = await activate(
      page.request,
      headers,
      originalReleaseId!,
      "Restore the original E2E release",
    );
    expect(rollback).toMatchObject({
      fromReleaseId: candidate!.id,
      toReleaseId: originalReleaseId,
    });
    await expectActiveRelease(
      page.request,
      candidate!.lexicon.key,
      originalReleaseId!,
    );
  },
);

async function activate(
  request: APIRequestContext,
  headers: Record<string, string>,
  releaseId: string,
  reason: string,
): Promise<{ fromReleaseId: string | null; toReleaseId: string }> {
  const previewResponse = await request.get(
    adminUrl(`/api/admin/v1/lexicon/releases/${releaseId}/activation-preview`),
  );
  await expectOk(previewResponse, "preview Lexicon activation");
  const preview = (await previewResponse.json()) as ActivationPreview;
  expect(preview).toMatchObject({
    releaseId,
    status: LexiconReleaseStatus.VALIDATED,
  });
  expect(preview.actionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

  const requestResponse = await request.post(
    adminUrl(`/api/admin/v1/lexicon/releases/${releaseId}/activation-requests`),
    { headers, data: { reason } },
  );
  await expectOk(requestResponse, "request Lexicon activation approval");
  const approval = (await requestResponse.json()) as {
    id: string;
    actionDigest: string;
    status: ApprovalRequestStatus;
  };
  expect(approval).toMatchObject({
    actionDigest: preview.actionDigest,
    status: ApprovalRequestStatus.PENDING,
  });

  const decisionResponse = await request.post(
    adminUrl(
      `/api/admin/v1/lexicon/activation-requests/${approval.id}/decisions`,
    ),
    {
      headers,
      data: {
        decision: ApprovalDecisionKind.APPROVE,
        reason,
        actionDigest: preview.actionDigest,
      },
    },
  );
  await expectOk(decisionResponse, "approve Lexicon activation");

  const activationResponse = await request.post(
    adminUrl(`/api/admin/v1/lexicon/releases/${releaseId}/activate`),
    {
      headers,
      data: { approvalId: approval.id, reason },
    },
  );
  await expectOk(activationResponse, "activate Lexicon release");
  return (await activationResponse.json()) as {
    fromReleaseId: string | null;
    toReleaseId: string;
  };
}

async function expectActiveRelease(
  request: APIRequestContext,
  lexiconKey: string,
  releaseId: string,
): Promise<void> {
  const response = await request.get(
    adminUrl("/api/admin/v1/lexicon/releases"),
  );
  await expectOk(response, "read active Lexicon release");
  const releases = (await response.json()) as Array<{
    lexicon: { key: string; activeReleaseId: string | null };
  }>;
  const lexiconReleases = releases.filter(
    ({ lexicon }) => lexicon.key === lexiconKey,
  );
  expect(lexiconReleases.length).toBeGreaterThan(0);
  expect(
    lexiconReleases.every(
      ({ lexicon }) => lexicon.activeReleaseId === releaseId,
    ),
  ).toBeTruthy();
}

async function expectOk(
  response: APIResponse,
  operation: string,
): Promise<void> {
  if (response.ok()) return;
  throw new Error(
    `${operation} failed: status=${response.status()} body=${await response.text()}`,
  );
}
