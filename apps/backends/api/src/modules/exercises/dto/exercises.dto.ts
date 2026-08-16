import { ExerciseResponseKind } from "@sylis/database";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateStudyAttemptDto {
  @IsUUID()
  planItemId!: string;
}

export class SubmitExerciseResponseDto {
  @IsEnum(ExerciseResponseKind)
  responseKind!: ExerciseResponseKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsUUID(undefined, { each: true })
  choiceIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  text?: string;

  @IsOptional()
  @IsBoolean()
  selfReported?: boolean;

  @IsOptional()
  @IsBoolean()
  revealAcknowledged?: boolean;

  @IsOptional()
  @IsUUID()
  consentRecordId?: string;
}
