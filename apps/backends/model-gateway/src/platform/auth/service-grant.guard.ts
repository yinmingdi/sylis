import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import { ModelGatewayConfig } from "../../config/model-gateway.config";

@Injectable()
export class ServiceGrantGuard implements CanActivate {
  constructor(private readonly config: ModelGatewayConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      serviceKey?: string;
    }>();
    const header = request.headers.authorization;
    const value = typeof header === "string" ? header : "";
    const token = value.startsWith("Bearer ") ? value.slice(7) : "";
    const serviceKey = Object.entries(this.config.serviceGrantTokens).find(
      ([, expected]) => matches(token, expected),
    )?.[0];
    if (!serviceKey) {
      throw new UnauthorizedException("SERVICE_GRANT_INVALID");
    }
    request.serviceKey = serviceKey;
    return true;
  }
}

function matches(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
