import type { OperatorRole, SessionAudience } from "@sylis/database";

export interface ActorContext {
  userId: string;
  sessionId: string;
  audience: SessionAudience;
  roles: OperatorRole[];
  authStrength: string;
}
