import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

import { LexicalTargetKind } from "../../lexicon/lexical-target-kind";

export class CreateNotebookDto {
  @IsString()
  @Length(1, 80)
  @Matches(/\S/u)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateNotebookDto extends CreateNotebookDto {}

export class LexicalTargetDto {
  @ApiProperty({ enum: LexicalTargetKind, enumName: "LexicalTargetKind" })
  @IsEnum(LexicalTargetKind)
  kind!: LexicalTargetKind;

  @IsUUID()
  id!: string;
}

export class AddNotebookItemDto {
  @ApiProperty({ type: () => LexicalTargetDto })
  @ValidateNested()
  @Type(() => LexicalTargetDto)
  target!: LexicalTargetDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateNotebookItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}
