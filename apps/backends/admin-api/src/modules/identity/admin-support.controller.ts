import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OperatorRole } from "@sylis/database";
import { IsEnum, IsISO8601, IsString, Length } from "class-validator";

import { IdentityApiClient } from "../../integrations/identity-api/identity-api.client";
import {
  adminSessionToken,
  type AdminRequest,
} from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAnyRole,
  requireRecentReauthentication,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

class UserSearchDto {
  @IsString()
  @Length(2, 160)
  query!: string;
}

class ReasonDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;
}

class GrantRoleDto extends ReasonDto {
  @IsString()
  @Length(36, 36)
  targetUserId!: string;

  @IsEnum(OperatorRole)
  role!: OperatorRole;

  @IsString()
  @Length(1, 80)
  policyVersion!: string;

  @IsISO8601()
  expiresAt!: string;
}

class LockUserDto extends ReasonDto {
  @IsString()
  @Length(1, 80)
  reasonCode!: string;
}

class SupportGrantAccessDto {
  @IsString()
  @Length(12, 160)
  requestId!: string;
}

@Controller("api/admin/v1/user-support")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(OperatorRole.SUPPORT, OperatorRole.SECURITY_ADMIN)
export class AdminUserSupportController {
  constructor(private readonly identity: IdentityApiClient) {}

  @Get("users")
  users(@Req() request: AdminRequest, @Query() query: UserSearchDto) {
    return this.identity.users(adminSessionToken(request), query.query);
  }

  @Post("users/:userId/session-revocations")
  revokeSessions(
    @Req() request: AdminRequest,
    @Param("userId") userId: string,
    @Body() input: ReasonDto,
  ) {
    requireRecentReauthentication(request);
    return this.identity.revokeUserSessions(
      adminSessionToken(request),
      userId,
      input.reason,
    );
  }

  @Post("support-grants/:grantId/access")
  @RequireAnyRole(OperatorRole.SUPPORT)
  accessGrant(
    @Req() request: AdminRequest,
    @Param("grantId") grantId: string,
    @Body() input: SupportGrantAccessDto,
  ) {
    requireRecentReauthentication(request);
    return this.identity.accessSupportGrant(
      adminSessionToken(request),
      grantId,
      input.requestId,
    );
  }
}

@Controller("api/admin/v1/operator-roles")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(OperatorRole.SECURITY_ADMIN)
export class AdminOperatorRolesController {
  constructor(private readonly identity: IdentityApiClient) {}

  @Get()
  operators(@Req() request: AdminRequest) {
    return this.identity.operators(adminSessionToken(request));
  }

  @Post()
  grant(@Req() request: AdminRequest, @Body() input: GrantRoleDto) {
    requireRecentReauthentication(request);
    return this.identity.grantOperatorRole(adminSessionToken(request), input);
  }

  @Post(":assignmentId/revocations")
  revoke(
    @Req() request: AdminRequest,
    @Param("assignmentId") assignmentId: string,
    @Body() input: ReasonDto,
  ) {
    requireRecentReauthentication(request);
    return this.identity.revokeOperatorRole(
      adminSessionToken(request),
      assignmentId,
      input.reason,
    );
  }
}

@Controller("api/admin/v1/user-security-locks")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(OperatorRole.SECURITY_ADMIN)
export class AdminUserSecurityController {
  constructor(private readonly identity: IdentityApiClient) {}

  @Post(":userId")
  lock(
    @Req() request: AdminRequest,
    @Param("userId") userId: string,
    @Body() input: LockUserDto,
  ) {
    requireRecentReauthentication(request);
    return this.identity.lockUser(adminSessionToken(request), {
      targetUserId: userId,
      reasonCode: input.reasonCode,
      reason: input.reason,
    });
  }
}
