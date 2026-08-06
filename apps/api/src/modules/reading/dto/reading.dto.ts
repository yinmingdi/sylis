import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class ResolveSelectionDto {
  @IsString()
  text!: string;
}

export class RecordReadingActivityDto {
  @IsString()
  documentId!: string;

  @IsOptional()
  @IsString()
  revisionId?: string;

  @IsIn(["OPEN", "PROGRESS", "COMPLETE", "LOOKUP"])
  eventKind!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  progress?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class SaveReadingDto {
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  releaseId?: string;

  @IsOptional()
  @IsIn(["HEADWORD", "ENTRY", "SENSE", "COLLOCATION"])
  targetKind?: string;

  @IsOptional()
  @IsString()
  targetId?: string;
}
