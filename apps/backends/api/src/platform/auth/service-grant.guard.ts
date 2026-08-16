import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import { ApiConfig } from "../../config/api.config";

export interface ServiceGrantRequest {
  headers: Record<string, string | string[] | undefined>;
  serviceKey?: string;
}

@Injectable()
export class ServiceGrantGuard implements CanActivate {
  constructor(private readonly config: ApiConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ServiceGrantRequest>();
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
