import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class BookEditionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  after = -1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 100;
}

export class CreateEnrollmentDto {
  @IsUUID()
  bookId!: string;

  @IsUUID()
  editionId!: string;

  @IsInt()
  @Min(1)
  @Max(200)
  dailyNewLimit!: number;
}

export class UpdateEnrollmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  dailyNewLimit?: number;
}

export class MigrateEnrollmentDto {
  @IsUUID()
  editionId!: string;

  @IsBoolean()
  confirm = false;
}
