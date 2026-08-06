import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class CreateTutorSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}

export class TutorContextRefDto {
  @IsIn(["HEADWORD", "ENTRY", "SENSE", "READING_REVISION"])
  targetKind!: string;

  @IsString()
  targetId!: string;

  @IsOptional()
  @IsString()
  releaseId?: string;
}

export class CreateTutorMessageDto {
  @IsString()
  @MaxLength(8000)
  content!: string;

  @IsString()
  consentRecordId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TutorContextRefDto)
  contextRefs: TutorContextRefDto[] = [];
}

export class CreateGrammarDiagnosisDto {
  @IsString()
  @MaxLength(12000)
  text!: string;

  @IsString()
  languageTag!: string;

  @IsString()
  consentRecordId!: string;
}

export class CreateReadingGenerationDto {
  @IsString()
  difficulty!: string;

  @IsString()
  consentRecordId!: string;

  @IsOptional()
  constraints?: Record<string, unknown>;
}
