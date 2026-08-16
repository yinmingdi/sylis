import {
  OperatorRole,
  SessionAudience,
  SessionAuthStrength,
} from "@sylis/database";
import { describe, expect, it } from "vitest";

import { AdminApiConfig } from "../src/config/admin-api.config";
import { IdentityApiClient } from "../src/integrations/identity-api/identity-api.client";
import { AdminIdentityController } from "../src/modules/identity/admin-identity.controller";
import type { AdminRequest } from "../src/platform/auth/admin-actor";

describe("AdminIdentityController session contract", () => {
  it("projects the guarded identity session for the Admin client", () => {
    const controller = new AdminIdentityController(
      {} as IdentityApiClient,
      {} as AdminApiConfig,
    );
    const expiresAt = "2026-08-10T12:00:00.000Z";
    const request: AdminRequest = {
      method: "GET",
      headers: {},
      actor: {
        userId: "10000000-0000-4000-8000-000000000001",
        sessionId: "20000000-0000-4000-8000-000000000001",
        roles: [OperatorRole.SECURITY_ADMIN],
        reauthenticatedAt: null,
      },
      sessionProjection: {
        userId: "10000000-0000-4000-8000-000000000001",
        sessionId: "20000000-0000-4000-8000-000000000001",
        roles: [OperatorRole.SECURITY_ADMIN],
        authStrength: SessionAuthStrength.PASSWORD_MFA,
        reAuthenticatedAt: null,
        expiresAt,
        csrfToken: "csrf-token",
      },
    };

    expect(controller.session(request)).toEqual({
      actor: { id: request.actor?.userId },
      session: {
        id: request.actor?.sessionId,
        audience: SessionAudience.ADMIN,
        authStrength: SessionAuthStrength.PASSWORD_MFA,
        expiresAt,
      },
      roles: [OperatorRole.SECURITY_ADMIN],
      csrfToken: "csrf-token",
    });
  });
});
