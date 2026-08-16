import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";

import { JobRuntimeService } from "./job-runtime.service";
import {
  ServiceGrantGuard,
  type ServiceGrantRequest,
} from "../../platform/auth/service-grant.guard";

@Controller("internal/v1/jobs/runtime")
@UseGuards(ServiceGrantGuard)
export class InternalJobRuntimeController {
  constructor(private readonly runtime: JobRuntimeService) {}

  @Post("claim")
  claim(@Req() request: ServiceGrantRequest, @Body() body: unknown) {
    return this.runtime.claim(serviceKey(request), body).then(serializeAttempt);
  }
  @Post("heartbeat")
  heartbeat(@Req() request: ServiceGrantRequest, @Body() body: unknown) {
    return this.runtime.heartbeat(serviceKey(request), body);
  }
  @Post("checkpoint")
  checkpoint(@Req() request: ServiceGrantRequest, @Body() body: unknown) {
    return this.runtime.checkpoint(serviceKey(request), body);
  }
  @Post("progress")
  progress(@Req() request: ServiceGrantRequest, @Body() body: unknown) {
    return this.runtime.progress(serviceKey(request), body);
  }
  @Post("cancellation")
  cancellation(@Req() request: ServiceGrantRequest, @Body() body: unknown) {
    return this.runtime.cancellation(serviceKey(request), body);
  }
  @Post("finish")
  finish(@Req() request: ServiceGrantRequest, @Body() body: unknown) {
    return this.runtime.finish(serviceKey(request), body);
  }
  @Post("fail")
  fail(@Req() request: ServiceGrantRequest, @Body() body: unknown) {
    return this.runtime.fail(serviceKey(request), body);
  }
}

function serviceKey(request: ServiceGrantRequest): string {
  if (!request.serviceKey) throw new Error("SERVICE_GRANT_CONTEXT_MISSING");
  return request.serviceKey;
}

function serializeAttempt<
  T extends { fencingToken: bigint; leaseExpiresAt: Date } | null,
>(value: T) {
  return value
    ? {
        ...value,
        fencingToken: value.fencingToken.toString(),
        leaseExpiresAt: value.leaseExpiresAt.toISOString(),
      }
    : null;
}
