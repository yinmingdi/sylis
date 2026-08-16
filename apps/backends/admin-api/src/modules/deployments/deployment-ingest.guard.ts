import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import { AdminApiConfig } from "../../config/admin-api.config";

interface DeploymentIngestRequest {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class DeploymentIngestGuard implements CanActivate {
  constructor(private readonly config: AdminApiConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<DeploymentIngestRequest>();
    const authorization = request.headers.authorization;
    const token =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
    if (!equal(token, this.config.deploymentIngestToken)) {
      throw new UnauthorizedException("DEPLOYMENT_INGEST_GRANT_INVALID");
    }
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
