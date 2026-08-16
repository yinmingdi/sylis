import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OperatorRole } from "@sylis/database";

import {
  AuditQueryDto,
  CreateAuditArchiveDto,
  CreateAuditRetentionPolicyDto,
  CreateAuditExportDto,
  CreateLegalHoldDto,
  ReleaseLegalHoldDto,
  PurgeAuditArchiveDto,
} from "./audit.dto";
import { AuditService } from "./audit.service";
import type { AdminRequest } from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAnyRole,
  adminActor,
  requireRecentReauthentication,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Controller("api/admin/v1/audit")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(OperatorRole.SECURITY_ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get("security-events")
  securityEvents(@Query() query: AuditQueryDto) {
    return this.audit.securityEvents(query);
  }

  @Get("data-access-events")
  dataAccessEvents(@Query() query: AuditQueryDto) {
    return this.audit.dataAccessEvents(query);
  }

  @Get("retention")
  retention() {
    return this.audit.retention();
  }

  @Post("retention-policies")
  createRetentionPolicy(
    @Req() request: AdminRequest,
    @Body() input: CreateAuditRetentionPolicyDto,
  ) {
    requireRecentReauthentication(request);
    return this.audit.createRetentionPolicy(adminActor(request), input);
  }

  @Post("archives")
  createArchive(
    @Req() request: AdminRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: CreateAuditArchiveDto,
  ) {
    requireRecentReauthentication(request);
    return this.audit.createArchive(adminActor(request), input, idempotencyKey);
  }

  @Post("archives/:archiveId/purges")
  purgeArchive(
    @Req() request: AdminRequest,
    @Param("archiveId") archiveId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: PurgeAuditArchiveDto,
  ) {
    requireRecentReauthentication(request);
    return this.audit.purgeArchive(
      adminActor(request),
      archiveId,
      input,
      idempotencyKey,
    );
  }

  @Get("legal-holds")
  legalHolds() {
    return this.audit.legalHolds();
  }

  @Post("legal-holds")
  createLegalHold(
    @Req() request: AdminRequest,
    @Body() input: CreateLegalHoldDto,
  ) {
    requireRecentReauthentication(request);
    return this.audit.createLegalHold(adminActor(request), input);
  }

  @Post("legal-holds/:holdId/releases")
  releaseLegalHold(
    @Req() request: AdminRequest,
    @Param("holdId") holdId: string,
    @Body() input: ReleaseLegalHoldDto,
  ) {
    requireRecentReauthentication(request);
    return this.audit.releaseLegalHold(adminActor(request), holdId, input);
  }

  @Get("exports")
  exports() {
    return this.audit.exports();
  }

  @Get("exports/:exportId")
  exportArtifact(
    @Req() request: AdminRequest,
    @Param("exportId") exportId: string,
  ) {
    requireRecentReauthentication(request);
    return this.audit.exportArtifact(adminActor(request), exportId);
  }

  @Post("exports")
  createExport(
    @Req() request: AdminRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: CreateAuditExportDto,
  ) {
    requireRecentReauthentication(request);
    return this.audit.createExport(adminActor(request), input, idempotencyKey);
  }
}
