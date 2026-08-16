import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import type { AgentServiceRequest } from "./actor";
import { AgentApiConfig } from "../../config/agent-api.config";

@Injectable()
export class ServiceGrantGuard implements CanActivate {
  constructor(private readonly config: AgentApiConfig) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AgentServiceRequest>();
    const authorization = request.headers.authorization;
    const token =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
    const serviceKey = Object.entries(this.config.serviceGrantTokens).find(
      ([, expected]) => equal(token, expected),
    )?.[0];
    if (!serviceKey) throw new UnauthorizedException("SERVICE_GRANT_INVALID");
    request.serviceKey = serviceKey;
    return true;
  }
}

function equal(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
