import { Type } from "class-transformer";
import { IsInt, IsString, Min, ValidateNested } from "class-validator";

import { SubmitExerciseResponseDto } from "../../exercises/dto/exercises.dto";

export class CreateAssessmentSessionDto {
  @IsString()
  blueprintRevisionId!: string;
}

export class SubmitAssessmentResponseDto {
  @IsString()
  attemptId!: string;

  @ValidateNested()
  @Type(() => SubmitExerciseResponseDto)
  response!: SubmitExerciseResponseDto;
}

export class AssessmentHistoryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 20;
}
