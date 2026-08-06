import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
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
  @IsIn(["CHOICE", "SHORT_TEXT", "EXTENDED_TEXT", "NO_CAPTURE"])
  responseKind!: "CHOICE" | "SHORT_TEXT" | "EXTENDED_TEXT" | "NO_CAPTURE";

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
  @IsUUID()
  consentRecordId?: string;
}
