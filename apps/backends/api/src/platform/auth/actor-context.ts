import type {
  OperatorRole,
  SessionAudience,
  SessionAuthStrength,
} from "@sylis/database";

export interface ActorContext {
  userId: string;
  sessionId: string;
  audience: SessionAudience;
  roles: OperatorRole[];
  authStrength: SessionAuthStrength;
}
