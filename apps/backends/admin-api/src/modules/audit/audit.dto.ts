import {
  LegalHoldScopeKind,
  OperatorRole,
  SecurityAuditCategory,
  SecurityAuditResult,
} from "@sylis/database";
import { AuditEventStreamKind } from "@sylis/job-contracts";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";

export class AuditQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsEnum(SecurityAuditCategory)
  @IsOptional()
  category?: SecurityAuditCategory;

  @IsEnum(SecurityAuditResult)
  @IsOptional()
  result?: SecurityAuditResult;

  @IsString()
  @Length(1, 200)
  @IsOptional()
  action?: string;

  @IsEnum(OperatorRole)
  @IsOptional()
  actorRole?: OperatorRole;

  @IsString()
  @IsUUID()
  @IsOptional()
  actorUserId?: string;

  @IsString()
  @Length(1, 200)
  @IsOptional()
  targetType?: string;

  @IsString()
  @IsUUID()
  @IsOptional()
  targetId?: string;

  @IsString()
  @Length(1, 200)
  @IsOptional()
  requestId?: string;

  @IsString()
  @Length(1, 200)
  @IsOptional()
  correlationId?: string;

  @IsString()
  @Length(1, 200)
  @IsOptional()
  actionDigest?: string;

  @IsString()
  @Length(1, 200)
  @IsOptional()
  deploymentId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit = 100;
}

export class CreateAuditExportDto extends AuditQueryDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(AuditEventStreamKind, { each: true })
  streams: AuditEventStreamKind[] = Object.values(AuditEventStreamKind);

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class CreateAuditArchiveDto {
  @IsEnum(SecurityAuditCategory)
  category!: SecurityAuditCategory;

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class PurgeAuditArchiveDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class CreateLegalHoldDto {
  @IsEnum(LegalHoldScopeKind)
  scopeKind!: LegalHoldScopeKind;

  @IsString()
  @Length(1, 200)
  @IsOptional()
  scopeRef?: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;

  @IsString()
  @Length(1, 200)
  @IsOptional()
  externalReference?: string;

  @IsISO8601()
  reviewAt!: string;
}

export class ReleaseLegalHoldDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class CreateAuditRetentionPolicyDto {
  @IsEnum(SecurityAuditCategory)
  category!: SecurityAuditCategory;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  onlineDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  archiveDays!: number;

  @IsString()
  @Length(1, 120)
  policyVersion!: string;

  @IsISO8601()
  effectiveAt!: string;
}
