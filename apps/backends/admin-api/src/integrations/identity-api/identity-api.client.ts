import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  MfaCredentialKind,
  OperatorRole,
  SessionAuthStrength,
} from "@sylis/database";

import { AdminApiConfig } from "../../config/admin-api.config";

export interface AdminChallengeInput {
  email: string;
  password: string;
}

export interface AdminMfaInput {
  challengeToken: string;
  method: MfaCredentialKind;
  code?: string;
  response?: Record<string, unknown>;
}

export interface IssuedAdminSession {
  token: string;
  csrfToken: string;
  sessionId: string;
  expiresAt: string;
}

export interface AdminSessionProjection {
  userId: string;
  sessionId: string;
  roles: OperatorRole[];
  authStrength: SessionAuthStrength;
  reAuthenticatedAt: string | null;
  expiresAt: string;
  csrfToken: string;
}

@Injectable()
export class IdentityApiClient {
  constructor(private readonly config: AdminApiConfig) {}

  beginLogin(input: AdminChallengeInput) {
    return this.post<{
      challengeToken: string;
      methods: MfaCredentialKind[];
      webAuthnOptions: Record<string, unknown> | null;
    }>("challenges", input);
  }

  completeLogin(input: AdminMfaInput) {
    return this.post<IssuedAdminSession>("sessions", input);
  }

  validateSession(
    token: string,
    input: { method: string; origin?: string; csrfToken?: string },
  ) {
    return this.post<AdminSessionProjection>("session-validations", {
      token,
      ...input,
    });
  }

  beginReauthentication(token: string, password: string) {
    return this.post<{
      challengeToken: string;
      methods: MfaCredentialKind[];
      webAuthnOptions: Record<string, unknown> | null;
    }>("reauthentication-challenges", { token, password });
  }

  reauthenticate(token: string, input: AdminMfaInput) {
    return this.post<
      IssuedAdminSession & {
        reAuthenticatedAt: string;
        validForSeconds: number;
      }
    >("reauthentications", { token, ...input });
  }

  revokeSession(token: string) {
    return this.post<void>("session-revocations", { token });
  }

  users(token: string, query: string) {
    return this.post<unknown[]>("user-queries", { token, query });
  }

  revokeUserSessions(token: string, targetUserId: string, reason: string) {
    return this.post<{ revokedCount: number; revokedAt: string }>(
      "user-session-revocations",
      { token, targetUserId, reason },
    );
  }

  operators(token: string) {
    return this.post<unknown[]>("operator-queries", { token });
  }

  grantOperatorRole(
    token: string,
    input: {
      targetUserId: string;
      role: OperatorRole;
      reason: string;
      policyVersion: string;
      expiresAt: string;
    },
  ) {
    return this.post<unknown>("operator-role-grants", { token, ...input });
  }

  revokeOperatorRole(token: string, assignmentId: string, reason: string) {
    return this.post<unknown>("operator-role-revocations", {
      token,
      assignmentId,
      reason,
    });
  }

  lockUser(
    token: string,
    input: { targetUserId: string; reasonCode: string; reason: string },
  ) {
    return this.post<unknown>("user-security-locks", { token, ...input });
  }

  accessSupportGrant(token: string, grantId: string, requestId: string) {
    return this.postAt<unknown>("/internal/v1/identity/support-grants/access", {
      token,
      grantId,
      requestId,
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.postAt(`/internal/v1/identity/admin-auth/${path}`, body);
  }

  private async postAt<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.config.identityApiUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.identityApiServiceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException("IDENTITY_API_UNAVAILABLE");
    }
    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException("ADMIN_IDENTITY_REJECTED");
    }
    if (!response.ok) {
      throw new ServiceUnavailableException("IDENTITY_API_REJECTED");
    }
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
