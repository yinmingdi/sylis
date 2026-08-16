import {
  AdminOperatorRole,
  AdminSessionAudience,
  AdminSessionAuthStrength,
  CredentialStatus,
  CredentialType,
  adminApiClient,
  type AdminCredentialProfileView,
  type AdminProviderRouteView,
  type AdminSessionView,
} from "@sylis/api-client/admin";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { adminSessionQuery, adminSessionScope } from "../../modules/identity";
import { credentialQuery } from "../../modules/credentials";
import { providerRouteQuery } from "../../modules/provider-routes";
import { CredentialsPage } from "./credentials-page";

const session: AdminSessionView = {
  actor: { id: "00000000-0000-4000-8000-000000000010" },
  session: {
    id: "00000000-0000-4000-8000-000000000011",
    audience: AdminSessionAudience.ADMIN,
    authStrength: AdminSessionAuthStrength.PASSWORD_MFA,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
  roles: [AdminOperatorRole.MODEL_OPERATOR],
  csrfToken: "csrf-token",
};

const credential: AdminCredentialProfileView = {
  id: "00000000-0000-4000-8000-000000000020",
  providerKey: "deepseek",
  label: "DeepSeek platform",
  status: CredentialStatus.PENDING,
  currentRevisionId: null,
  revisions: [
    {
      id: "00000000-0000-4000-8000-000000000021",
      revisionNo: 1,
      credentialType: CredentialType.API_KEY,
      status: CredentialStatus.PENDING,
      maskedHint: "****test",
      validatedAt: null,
      expiresAt: null,
      revokedAt: null,
    },
  ],
};

const route: AdminProviderRouteView = {
  id: "00000000-0000-4000-8000-000000000030",
  providerKey: "deepseek",
  modelId: "deepseek-v4-flash",
  endpointClass: "CHAT_COMPLETIONS",
  capabilities: ["TEXT_GENERATION", "STRUCTURED_GENERATION"],
  adapterVersion: "deepseek-chat-completions/1",
  pricingVersion: "deepseek-v4-2026-08-13-usd/1",
  pricing: {},
  policyVersion: "deepseek-nonthinking-strict-tools/1",
  releaseDigest:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  status: "PUBLISHED",
};

describe("CredentialsPage", () => {
  it("validates a pending platform credential against a matching provider route", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminApiClient.auth, "beginReauthentication").mockResolvedValue({
      challengeToken: "challenge-token",
      methods: ["TOTP"],
      webAuthnOptions: null,
    });
    vi.spyOn(adminApiClient.auth, "reauthenticate").mockResolvedValue({
      reauthenticatedAt: new Date().toISOString(),
      validForSeconds: 300,
    });
    const validate = vi
      .spyOn(adminApiClient.models, "validateCredential")
      .mockResolvedValue({ id: credential.revisions[0]!.id });
    vi.spyOn(adminApiClient.models, "credentials").mockResolvedValue([
      credential,
    ]);
    vi.spyOn(adminApiClient.models, "routes").mockResolvedValue([route]);
    const cache = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const scope = adminSessionScope(session);
    cache.setQueryData(adminSessionQuery.queryKey, session);
    cache.setQueryData(credentialQuery(scope).queryKey, [credential]);
    cache.setQueryData(providerRouteQuery(scope).queryKey, [route]);
    render(
      <QueryClientProvider client={cache}>
        <CredentialsPage />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "验证" }));
    expect(
      screen.getByRole("option", { name: "deepseek / deepseek-v4-flash" }),
    ).toBeTruthy();
    await user.type(
      screen.getAllByLabelText("Reason").at(-1)!,
      "local validation",
    );
    await user.type(
      screen.getAllByLabelText("管理员密码").at(-1)!,
      "admin-password",
    );
    await user.type(screen.getAllByLabelText("TOTP").at(-1)!, "123456");
    await user.click(
      screen.getAllByRole("button", { name: "TOTP 认证" }).at(-1)!,
    );
    await user.click(screen.getByRole("button", { name: "验证并启用" }));

    await waitFor(() =>
      expect(validate).toHaveBeenCalledWith(
        credential.revisions[0]!.id,
        route.id,
        "local validation",
      ),
    );
  });
});
