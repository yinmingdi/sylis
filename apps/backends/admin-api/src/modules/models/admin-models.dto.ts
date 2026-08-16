import {
  CredentialType,
  ModelPolicyScopeKind,
  ModelPurposeKind,
  ProviderHealthProbeKind,
} from "@sylis/database";
import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class AdminReasonDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class CreateModelCredentialDto extends AdminReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  providerKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @IsEnum(CredentialType)
  credentialType!: CredentialType;

  @IsString()
  @MinLength(1)
  @MaxLength(32_768)
  secret!: string;

  @IsObject()
  metadata!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class RotateModelCredentialDto extends AdminReasonDto {
  @IsEnum(CredentialType)
  credentialType!: CredentialType;

  @IsString()
  @MinLength(1)
  @MaxLength(32_768)
  secret!: string;

  @IsObject()
  metadata!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class ValidateModelCredentialDto extends AdminReasonDto {
  @IsString()
  routeReleaseId!: string;
}

export class ProbeModelRouteDto extends AdminReasonDto {
  @IsString()
  credentialRevisionId!: string;

  @IsEnum(ProviderHealthProbeKind)
  probeKind!: ProviderHealthProbeKind;
}

export class CreateBudgetPolicyDto extends AdminReasonDto {
  @IsEnum(ModelPolicyScopeKind)
  scopeKind!: ModelPolicyScopeKind;

  @IsOptional()
  @IsString()
  scopeId?: string;

  @IsEnum(ModelPurposeKind)
  purpose!: ModelPurposeKind;

  @Matches(/^[1-9][0-9]*$/)
  maxUnits!: string;

  @Matches(/^[1-9][0-9]*$/)
  maxCostMicros!: string;

  @Min(60)
  @Max(31_536_000)
  windowSeconds!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  policyVersion!: string;
}

export class CreateQuotaPolicyDto extends AdminReasonDto {
  @IsEnum(ModelPolicyScopeKind)
  scopeKind!: ModelPolicyScopeKind;

  @IsOptional()
  @IsString()
  scopeId?: string;

  @IsEnum(ModelPurposeKind)
  purpose!: ModelPurposeKind;

  @IsOptional()
  @IsString()
  routeReleaseId?: string;

  @Matches(/^[1-9][0-9]*$/)
  maxRequests!: string;

  @Matches(/^[1-9][0-9]*$/)
  maxUnits!: string;

  @Min(60)
  @Max(31_536_000)
  windowSeconds!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  policyVersion!: string;
}
