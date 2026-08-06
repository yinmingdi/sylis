import { Type } from "class-transformer";
import { IsInt, IsString, Max, Min } from "class-validator";

export class SubmitReviewDto {
  @IsString()
  attemptId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  rating!: number;
}
