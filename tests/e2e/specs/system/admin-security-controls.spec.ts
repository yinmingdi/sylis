import {
  CredentialStatus,
  CredentialType,
  LegalHoldScopeKind,
  ModelPolicyScopeKind,
  ModelPurposeKind,
} from "@sylis/database";

import {
  adminUrl,
  operatorMutationHeaders,
  reauthenticateOperator,
} from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import { E2eModelProviderKey, TestTag, e2eTags } from "../../runtime";

interface CredentialProfile {
  id: string;
  providerKey: string;
  status: CredentialStatus;
  revisions: Array<{ maskedHint: string }>;
}

test(
  "ADMIN-SECURITY-001-E2E an operator reauthenticates and governs credentials, budgets, and legal holds",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ operatorPage: page }) => {
    await reauthenticateOperator(page);
    const headers = await operatorMutationHeaders(page);

    const credentialsResponse = await page.request.get(
      adminUrl("/api/admin/v1/models/credentials"),
    );
    expect(credentialsResponse.ok()).toBeTruthy();
    const credentials =
      (await credentialsResponse.json()) as CredentialProfile[];
    const fakeCredential = credentials.find(
      (credential) => credential.providerKey === E2eModelProviderKey.FAKE,
    );
    expect(fakeCredential).toBeTruthy();
    expect(fakeCredential!.revisions[0]?.maskedHint).toBe("****-key");
    expect(JSON.stringify(credentials)).not.toContain("fake-provider-key");

    const quarantine = await page.request.post(
      adminUrl(
        `/api/admin/v1/models/credentials/${fakeCredential!.id}/quarantines`,
      ),
      { headers, data: { reason: "E2E quarantine verification" } },
    );
    expect(quarantine.ok()).toBeTruthy();
    await expect(quarantine.json()).resolves.toMatchObject({
      id: fakeCredential!.id,
      status: CredentialStatus.QUARANTINED,
    });

    const restore = await page.request.post(
      adminUrl(
        `/api/admin/v1/models/credentials/${fakeCredential!.id}/restorations`,
      ),
      { headers, data: { reason: "E2E restoration verification" } },
    );
    expect(restore.ok()).toBeTruthy();
    await expect(restore.json()).resolves.toMatchObject({
      id: fakeCredential!.id,
      status: CredentialStatus.VERIFIED,
    });

    const disposableSecret = "e2e-disposable-provider-key";
    const createCredential = await page.request.post(
      adminUrl("/api/admin/v1/models/credentials"),
      {
        headers,
        data: {
          providerKey: E2eModelProviderKey.FAKE,
          label: "Disposable E2E credential",
          credentialType: CredentialType.API_KEY,
          secret: disposableSecret,
          metadata: { fixture: true },
          reason: "E2E credential lifecycle verification",
        },
      },
    );
    expect(createCredential.ok()).toBeTruthy();
    const disposable = (await createCredential.json()) as CredentialProfile;
    expect(JSON.stringify(disposable)).not.toContain(disposableSecret);

    const revoke = await page.request.post(
      adminUrl(`/api/admin/v1/models/credentials/${disposable.id}/revocations`),
      { headers, data: { reason: "E2E disposable credential revocation" } },
    );
    expect(revoke.ok()).toBeTruthy();
    await expect(revoke.json()).resolves.toMatchObject({
      id: disposable.id,
      status: CredentialStatus.REVOKED,
    });

    const budget = await page.request.post(
      adminUrl("/api/admin/v1/models/budget-policies"),
      {
        headers,
        data: {
          scopeKind: ModelPolicyScopeKind.PLATFORM,
          purpose: ModelPurposeKind.AGENT_RUN,
          maxUnits: "100000",
          maxCostMicros: "1000000",
          windowSeconds: 3600,
          policyVersion: "e2e-platform-budget/1",
          reason: "E2E platform budget verification",
        },
      },
    );
    expect(budget.ok()).toBeTruthy();
    await expect(budget.json()).resolves.toMatchObject({
      scopeKind: ModelPolicyScopeKind.PLATFORM,
      purpose: ModelPurposeKind.AGENT_RUN,
    });

    const holdInput = {
      scopeKind: LegalHoldScopeKind.GLOBAL,
      reason: "E2E legal hold verification",
      externalReference: "E2E-LEGAL-HOLD-001",
      reviewAt: "2036-01-01T00:00:00.000Z",
    };
    const holdResponse = await page.request.post(
      adminUrl("/api/admin/v1/audit/legal-holds"),
      { headers, data: holdInput },
    );
    expect(holdResponse.ok()).toBeTruthy();
    const hold = (await holdResponse.json()) as { id: string };

    const holdsResponse = await page.request.get(
      adminUrl("/api/admin/v1/audit/legal-holds"),
    );
    expect(holdsResponse.ok()).toBeTruthy();
    await expect(holdsResponse.json()).resolves.toContainEqual(
      expect.objectContaining({ id: hold.id, ...holdInput }),
    );

    const release = await page.request.post(
      adminUrl(`/api/admin/v1/audit/legal-holds/${hold.id}/releases`),
      {
        headers,
        data: { reason: "E2E legal hold release verification" },
      },
    );
    expect(release.ok()).toBeTruthy();
    await expect(release.json()).resolves.toMatchObject({
      id: hold.id,
      releaseReason: "E2E legal hold release verification",
      releasedAt: expect.any(String),
    });
  },
);
