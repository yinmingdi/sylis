export interface AgentActor {
  userId: string;
  sessionId: string;
}

export interface AgentUserRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  actor?: AgentActor;
}

export interface AgentServiceRequest {
  headers: Record<string, string | string[] | undefined>;
  serviceKey?: string;
}
