import { ReadingActivityKind, TextOffsetUnit } from "@sylis/database";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class ResolveSelectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  text!: string;

  @Matches(/^sha256:[a-f0-9]{64}$/)
  revisionContentHash!: string;

  @IsEnum(TextOffsetUnit)
  offsetUnit!: TextOffsetUnit;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  startOffset!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  endOffset!: number;
}

export class RecordReadingActivityDto {
  @IsString()
  documentId!: string;

  @IsString()
  revisionId!: string;

  @IsEnum(ReadingActivityKind)
  kind!: ReadingActivityKind;

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
  position?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  learnedWordCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalReadSeconds?: number;
}

export class SaveReadingCollectionItemDto {
  @IsString()
  documentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  thumbnailUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
