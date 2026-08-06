import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateNotebookDto {
  @IsString()
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateNotebookDto extends CreateNotebookDto {}

export class LexicalTargetDto {
  @IsIn(["HEADWORD", "ENTRY", "SENSE", "COLLOCATION"])
  kind!: "HEADWORD" | "ENTRY" | "SENSE" | "COLLOCATION";

  @IsString()
  id!: string;
}

export class AddNotebookItemDto {
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
