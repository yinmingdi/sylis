import type { Request } from "express";

import type { ActorContext } from "./actor-context";

export type AuthenticatedRequest = Request & {
  actor: ActorContext;
};
