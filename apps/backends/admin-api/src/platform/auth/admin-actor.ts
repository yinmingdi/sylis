import type { OperatorRole } from "@sylis/database";

import type { AdminSessionProjection } from "../../integrations/identity-api/identity-api.client";

export interface AdminActor {
  userId: string;
  sessionId: string;
  roles: readonly OperatorRole[];
  reauthenticatedAt: Date | null;
}

export interface AdminRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  actor?: AdminActor;
  sessionToken?: string;
  sessionProjection?: AdminSessionProjection;
}

export function adminSessionToken(request: AdminRequest): string {
  if (!request.sessionToken) throw new Error("ADMIN_SESSION_TOKEN_MISSING");
  return request.sessionToken;
}
