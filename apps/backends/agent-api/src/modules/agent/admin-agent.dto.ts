import { AgentReleaseCommandKind } from "@sylis/agent-contracts";
import {
  AgentEvaluationKind,
  AgentReleaseEnvironment,
  OperatorRole,
} from "@sylis/database";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class AgentAdminActorDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  sessionId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(OperatorRole, { each: true })
  roles!: OperatorRole[];
}

export class AgentAdminActorBodyDto {
  @ValidateNested()
  @Type(() => AgentAdminActorDto)
  actor!: AgentAdminActorDto;
}

export class AgentRunTerminationPreviewDto extends AgentAdminActorBodyDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class AgentRunTerminationDto extends AgentRunTerminationPreviewDto {
  @Matches(/^sha256:[0-9a-f]{64}$/)
  actionDigest!: string;
}

export class AgentReleaseActionPreviewDto extends AgentAdminActorBodyDto {
  @IsEnum(AgentReleaseCommandKind)
  action!: AgentReleaseCommandKind;

  @IsString()
  @MinLength(8)
  @MaxLength(1_000)
  reason!: string;

  @IsEnum(AgentReleaseEnvironment)
  @IsOptional()
  environment?: AgentReleaseEnvironment;

  @IsUUID()
  @IsOptional()
  targetReleaseId?: string;

  @IsEnum(AgentEvaluationKind)
  @IsOptional()
  evaluationKind?: AgentEvaluationKind;

  @IsUUID()
  @IsOptional()
  evalReleaseId?: string;
}

export class AgentReleaseActionDto extends AgentAdminActorBodyDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1_000)
  reason!: string;

  @Matches(/^sha256:[0-9a-f]{64}$/)
  actionDigest!: string;
}

export class AgentReleaseEvaluationDto extends AgentReleaseActionDto {
  @IsEnum(AgentEvaluationKind)
  evaluationKind!: AgentEvaluationKind;

  @IsUUID()
  evalReleaseId!: string;
}

export class AgentReleasePromotionDto extends AgentReleaseActionDto {
  @IsEnum(AgentReleaseEnvironment)
  environment!: AgentReleaseEnvironment;
}

export class AgentReleaseRollbackDto extends AgentReleasePromotionDto {
  @IsUUID()
  targetReleaseId!: string;
}
