import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  SessionAudience,
  SessionAuthStrength,
  OperatorRole,
} from "@sylis/database";
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from "class-validator";

import { Public } from "../../../platform/auth/public.decorator";
import {
  ServiceGrantGuard,
  type ServiceGrantRequest,
} from "../../../platform/auth/service-grant.guard";
import {
  AdminChallengeDto,
  AdminMfaAssertionDto,
  AdminSessionDto,
} from "../dto/identity.dto";
import { IdentityAdminService } from "../services/identity-admin.service";
import { IdentityService } from "../services/identity.service";

class AdminSessionValidationDto {
  @IsString()
  @Length(20, 256)
  token!: string;

  @IsString()
  @Length(3, 16)
  method!: string;

  @IsString()
  @IsOptional()
  origin?: string;

  @IsString()
  @IsOptional()
  csrfToken?: string;
}

class AdminReauthenticationChallengeDto {
  @IsString()
  @Length(20, 256)
  token!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

class AdminTokenDto {
  @IsString()
  @Length(20, 256)
  token!: string;
}

class AdminReauthenticationDto extends AdminMfaAssertionDto {
  @IsString()
  @Length(20, 256)
  token!: string;
}

class AdminUserQueryDto extends AdminTokenDto {
  @IsString()
  @Length(2, 160)
  query!: string;
}

class AdminUserCommandDto extends AdminTokenDto {
  @IsString()
  @Length(36, 36)
  targetUserId!: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

class GrantOperatorRoleDto extends AdminUserCommandDto {
  @IsEnum(OperatorRole)
  role!: OperatorRole;

  @IsString()
  @Length(1, 80)
  policyVersion!: string;

  @IsISO8601()
  expiresAt!: string;
}

class RevokeOperatorRoleDto extends AdminTokenDto {
  @IsString()
  @Length(36, 36)
  assignmentId!: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

class CreateUserSecurityLockDto extends AdminUserCommandDto {
  @IsString()
  @Length(1, 80)
  reasonCode!: string;
}

@Public()
@UseGuards(ServiceGrantGuard)
@Controller("internal/v1/identity/admin-auth")
export class InternalIdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly admin: IdentityAdminService,
  ) {}

  @Post("challenges")
  challenge(@Body() input: AdminChallengeDto) {
    return this.identity.beginAdminLogin(input);
  }

  @Post("sessions")
  session(@Body() input: AdminSessionDto) {
    return this.identity.completeAdminLogin(input);
  }

  @Post("session-validations")
  validate(@Body() input: AdminSessionValidationDto) {
    return this.identity.validateAdminSessionToken(input.token, input);
  }

  @Post("reauthentication-challenges")
  async reauthenticationChallenge(
    @Body() input: AdminReauthenticationChallengeDto,
  ) {
    const session = await this.identity.validateAdminSessionToken(input.token, {
      method: "GET",
    });
    return this.identity.beginAdminReauthentication(
      actor(session),
      input.password,
    );
  }

  @Post("reauthentications")
  async reauthenticate(@Body() input: AdminReauthenticationDto) {
    const session = await this.identity.validateAdminSessionToken(input.token, {
      method: "GET",
    });
    return this.identity.reauthenticateAdmin(actor(session), input);
  }

  @Post("session-revocations")
  revoke(@Body() input: AdminTokenDto) {
    return this.identity.revokeAdminSessionToken(input.token);
  }

  @Post("user-queries")
  users(@Body() input: AdminUserQueryDto) {
    return this.admin.searchUsers(input.token, input.query);
  }

  @Post("user-session-revocations")
  revokeUserSessions(@Body() input: AdminUserCommandDto) {
    return this.admin.revokeUserSessions(
      input.token,
      input.targetUserId,
      input.reason,
    );
  }

  @Post("operator-queries")
  operators(@Body() input: AdminTokenDto) {
    return this.admin.operators(input.token);
  }

  @Post("operator-role-grants")
  grantRole(@Body() input: GrantOperatorRoleDto) {
    return this.admin.grantRole(input.token, input);
  }

  @Post("operator-role-revocations")
  revokeRole(@Body() input: RevokeOperatorRoleDto) {
    return this.admin.revokeRole(input.token, input.assignmentId, input.reason);
  }

  @Post("user-security-locks")
  lockUser(@Body() input: CreateUserSecurityLockDto) {
    return this.admin.lockUser(
      input.token,
      input.targetUserId,
      input.reasonCode,
      input.reason,
    );
  }
}

@Public()
@UseGuards(ServiceGrantGuard)
@Controller("internal/v1/content-deletion-requests")
export class InternalIdentityRetentionController {
  constructor(private readonly identity: IdentityService) {}

  @Post(":requestId/user-purge")
  purgeUser(
    @Req() request: ServiceGrantRequest,
    @Param("requestId") requestId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
  ) {
    if (!request.serviceKey) throw new Error("SERVICE_ACTOR_MISSING");
    if (!attemptId || !/^[0-9]+$/.test(fencingToken ?? "")) {
      throw new Error("RETENTION_JOB_ATTEMPT_HEADERS_INVALID");
    }
    return this.identity.purgeUser(request.serviceKey, requestId, {
      attemptId,
      fencingToken: BigInt(fencingToken),
    });
  }
}

function actor(session: {
  userId: string;
  sessionId: string;
  roles: OperatorRole[];
}) {
  return {
    userId: session.userId,
    sessionId: session.sessionId,
    roles: session.roles,
    audience: SessionAudience.ADMIN,
    authStrength: SessionAuthStrength.PASSWORD_MFA,
  };
}
