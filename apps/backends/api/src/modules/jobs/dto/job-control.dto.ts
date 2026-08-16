import { IsString, MaxLength } from "class-validator";

export class ResumeJobDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
