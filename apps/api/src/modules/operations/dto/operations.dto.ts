import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class CompilerModelPolicyDto {
  @IsBoolean()
  enabled!: boolean;

  @ValidateIf((policy: CompilerModelPolicyDto) => policy.enabled)
  @ApiPropertyOptional({ enum: ["deepseek"] })
  @IsIn(["deepseek"])
  provider?: "deepseek";

  @ValidateIf((policy: CompilerModelPolicyDto) => policy.enabled)
  @IsString()
  model?: string;

  @ValidateIf((policy: CompilerModelPolicyDto) => policy.enabled)
  @IsString()
  promptVersion?: string;

  @ValidateIf((policy: CompilerModelPolicyDto) => policy.enabled)
  @IsString()
  schemaVersion?: string;

  @ValidateIf((policy: CompilerModelPolicyDto) => policy.enabled)
  @IsString()
  modelPolicyVersion?: string;

  @ValidateIf((policy: CompilerModelPolicyDto) => policy.enabled)
  @IsInt()
  @Min(1)
  @Max(16)
  concurrency?: number;

  @ValidateIf((policy: CompilerModelPolicyDto) => policy.enabled)
  @ApiPropertyOptional({ pattern: "^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$" })
  @IsString()
  @MaxLength(32)
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  inputUsdPerMillion?: string;

  @ValidateIf((policy: CompilerModelPolicyDto) => policy.enabled)
  @ApiPropertyOptional({ pattern: "^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$" })
  @IsString()
  @MaxLength(32)
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  outputUsdPerMillion?: string;

  @ValidateIf(
    (policy: CompilerModelPolicyDto) =>
      policy.enabled && policy.cacheHitUsdPerMillion !== undefined,
  )
  @ApiPropertyOptional({ pattern: "^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$" })
  @IsString()
  @MaxLength(32)
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  cacheHitUsdPerMillion?: string;
}

export class CreateBuildRunDto {
  @IsString() manifestUri!: string;
  @IsString() manifestHash!: string;
  @ApiProperty({ enum: ["pilot-200", "core-20000"] })
  @IsIn(["pilot-200", "core-20000"])
  compileProfile!: "pilot-200" | "core-20000";
  @IsInt() @Min(0) @Max(9_007_199_254_740_991) budgetMicros!: number;
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CompilerModelPolicyDto)
  modelPolicy!: CompilerModelPolicyDto;
}

export class CreateImportJobDto {
  @IsString() artifactUri!: string;
  @IsString() artifactHash!: string;
}

export class ApprovalReasonDto {
  @IsString() @MaxLength(1000) reason!: string;
}

export class ApprovalDecisionDto extends ApprovalReasonDto {
  @IsIn(["APPROVE", "REJECT"]) decision!: "APPROVE" | "REJECT";
}

export class CreateSourceSynchronizationDto {
  @IsIn(["REDDIT"])
  sourceKind!: "REDDIT";
}

export class WithdrawRedditSourceDto extends ApprovalReasonDto {}

export class UpdateRuntimeAiControlDto extends ApprovalReasonDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UserSupportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(320)
  query?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class UpdateUserStatusDto extends ApprovalReasonDto {
  @IsIn(["ACTIVE", "SUSPENDED"])
  status!: "ACTIVE" | "SUSPENDED";
}

export class RevokeAdminSessionDto extends ApprovalReasonDto {}

export class RecordDeploymentDto {
  @IsString() version!: string;
  @IsString() gitSha!: string;
  @IsIn(["staging", "production"]) environment!: "staging" | "production";
  @IsObject() imageDigests!: Record<string, string>;
  @IsObject() buildProof!: Record<string, unknown>;
  @IsIn(["BUILDING", "DEPLOYED", "FAILED", "ROLLED_BACK"])
  status!: "BUILDING" | "DEPLOYED" | "FAILED" | "ROLLED_BACK";
}
