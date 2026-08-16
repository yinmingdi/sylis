import { StudyRecognitionDecision } from "@sylis/database";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export enum StudyProgressEventKind {
  RECOGNITION = "RECOGNITION",
  ANSWER = "ANSWER",
}

export class UpdateStudyProgressDto {
  @IsEnum(StudyProgressEventKind)
  eventKind!: StudyProgressEventKind;

  @IsOptional()
  @IsEnum(StudyRecognitionDecision)
  recognitionDecision?: StudyRecognitionDecision;

  @IsOptional()
  @IsBoolean()
  correct?: boolean;
}

export class SubmitReviewDto {
  @IsString()
  attemptId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  rating!: number;
}
