import { ContentEvidenceKind, ReviewDecisionKind } from "@sylis/database";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from "class-validator";

export class CandidateRevisionEvidenceDto {
  @IsEnum(ContentEvidenceKind)
  evidenceKind!: ContentEvidenceKind;

  @IsUUID()
  @IsOptional()
  sourceRecordId?: string;

  @IsUUID()
  @IsOptional()
  upstreamProvenanceId?: string;

  @IsString()
  @IsOptional()
  @Length(1, 1000)
  note?: string;
}

export class ReviseCandidateDto {
  @IsString()
  @Length(36, 36)
  expectedRevisionId!: string;

  @IsString()
  @Length(1, 80)
  schemaVersion!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CandidateRevisionEvidenceDto)
  evidence!: CandidateRevisionEvidenceDto[];

  @IsObject()
  validationSummary!: Record<string, unknown>;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class DecideReviewItemDto {
  @IsString()
  @Length(36, 36)
  candidateRevisionId!: string;

  @IsEnum(ReviewDecisionKind)
  decision!: ReviewDecisionKind;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}
