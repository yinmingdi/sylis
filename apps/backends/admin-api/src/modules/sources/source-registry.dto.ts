import {
  RightsEvidenceKind,
  SourceDatasetVersionStatus,
} from "@sylis/database";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";

export class RegisterSourceRightsPolicyDto {
  @IsBoolean()
  mayBuild!: boolean;

  @IsBoolean()
  mayServe!: boolean;

  @IsBoolean()
  mayExport!: boolean;

  @IsBoolean()
  requiresAttribution!: boolean;

  @IsString()
  @IsOptional()
  @Length(1, 500)
  attribution?: string;

  @IsISO8601()
  effectiveFrom!: string;

  @IsISO8601()
  @IsOptional()
  effectiveTo?: string;
}

export class RegisterSourceVersionDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,63}$/)
  datasetKey!: string;

  @IsString()
  @Length(1, 160)
  datasetName!: string;

  @IsUrl({ require_tld: false })
  homepageUri!: string;

  @IsString()
  @Length(1, 80)
  version!: string;

  @IsUrl({ protocols: ["https"], require_protocol: true, require_tld: false })
  sourceUri!: string;

  @IsString()
  @Matches(/^sha256:[a-f0-9]{64}$/)
  checksum!: string;

  @IsISO8601()
  retrievedAt!: string;

  @IsString()
  @Length(1, 120)
  adapter!: string;

  @IsString()
  @Length(1, 80)
  parserVersion!: string;

  @IsString()
  @Length(1, 80)
  schemaVersion!: string;

  @IsObject()
  validationSummary!: Record<string, unknown>;

  @IsEnum(SourceDatasetVersionStatus)
  status!: SourceDatasetVersionStatus;

  @ValidateNested()
  @Type(() => RegisterSourceRightsPolicyDto)
  rights!: RegisterSourceRightsPolicyDto;
}

export class CreateRightsDecisionDto {
  @IsString()
  @Length(1, 80)
  policyVersion!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RightsDecisionEvidenceDto)
  evidence!: RightsDecisionEvidenceDto[];

  @IsBoolean()
  mayBuild!: boolean;

  @IsBoolean()
  mayServe!: boolean;

  @IsBoolean()
  mayExport!: boolean;

  @IsString()
  @IsOptional()
  @Length(1, 500)
  attribution?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  restrictions!: string[];

  @IsISO8601()
  effectiveAt!: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class RightsDecisionEvidenceDto {
  @IsEnum(RightsEvidenceKind)
  evidenceKind!: RightsEvidenceKind;

  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9+.-]*:/)
  referenceUri!: string;

  @IsString()
  @Matches(/^sha256:[a-f0-9]{64}$/)
  contentHash!: string;

  @IsString()
  @IsOptional()
  @Length(1, 1000)
  note?: string;

  @IsISO8601()
  capturedAt!: string;
}
