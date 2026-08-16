import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";
import { SupportGrantPurpose, SupportResourceKind } from "@sylis/database";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import { SupportGrantService } from "../services/support-grant.service";

interface SupportGrantTargetBody {
  supportUserId: string;
  resourceKind: SupportResourceKind;
  resourceId: string;
  resourceRevisionId: string;
  purpose: SupportGrantPurpose;
  purposeDetails: string;
}

@Controller("api/v1/users/me/support-grants")
export class SupportGrantsController {
  constructor(private readonly grants: SupportGrantService) {}

  @Get()
  list(@Actor() actor: ActorContext) {
    return this.grants.list(actor);
  }

  @Post("previews")
  preview(
    @Actor() actor: ActorContext,
    @Body() body: SupportGrantTargetBody & { durationSeconds?: number },
  ) {
    return this.grants.preview(actor, body);
  }

  @Post()
  create(
    @Actor() actor: ActorContext,
    @Body()
    body: SupportGrantTargetBody & {
      expiresAt: string;
      actionDigest: string;
      idempotencyKey: string;
    },
  ) {
    return this.grants.create(actor, body);
  }

  @Delete(":grantId")
  @HttpCode(204)
  revoke(@Actor() actor: ActorContext, @Param("grantId") grantId: string) {
    return this.grants.revoke(actor, grantId);
  }
}
