import { ApiProperty } from "@nestjs/swagger";
import {
  ConsentDataCategory,
  ConsentDecision,
  ConsentPurpose,
  MfaCredentialKind,
} from "@sylis/database";
import { DataExportCategory } from "@sylis/job-contracts";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDataURI,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class RegistrationChallengeDto {
  @ApiProperty({ example: "learner@example.com" })
  @IsEmail()
  email!: string;
}

export class PasswordRecoveryChallengeDto extends RegistrationChallengeDto {}

export class ResetPasswordDto {
  @IsString()
  @Length(40, 2048)
  token!: string;

  @IsString()
  @Length(12, 128)
  password!: string;
}

export class RegisterDto {
  @IsString()
  @Length(40, 2048)
  token!: string;

  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @Length(1, 80)
  displayName!: string;

  @IsString()
  @Length(2, 35)
  timezone!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class UserReauthenticationDto {
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(12, 128)
  newPassword!: string;
}

export class UpdateUserDto {
  @IsString()
  @Length(2, 35)
  timezone!: string;

  @IsString()
  @Length(2, 35)
  locale!: string;

  @IsString()
  @Length(1, 80)
  @IsOptional()
  displayName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsDataURI()
  @MaxLength(7_000_000)
  @IsOptional()
  avatarUrl?: string;
}

export class ConsentRecordDto {
  @IsEnum(ConsentPurpose)
  purpose!: ConsentPurpose;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(ConsentDataCategory, { each: true })
  categories!: ConsentDataCategory[];

  @IsString()
  @MaxLength(64)
  policyVersion!: string;

  @IsEnum(ConsentDecision)
  decision!: ConsentDecision;
}

export class TotpCodeDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class WebAuthnEnrollmentDto {
  @IsString()
  @Length(36, 36)
  challengeId!: string;

  @IsString()
  @Length(1, 80)
  label!: string;

  @IsObject()
  response!: Record<string, unknown>;
}

export class AdminMfaAssertionDto {
  @IsString()
  @Length(20, 256)
  challengeToken!: string;

  @IsEnum(MfaCredentialKind)
  method!: MfaCredentialKind;

  @IsString()
  @IsOptional()
  code?: string;

  @IsObject()
  @IsOptional()
  response?: Record<string, unknown>;
}

export class DataExportDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(DataExportCategory, { each: true })
  scope!: DataExportCategory[];
}

export class AdminChallengeDto extends LoginDto {}

export class AdminSessionDto extends AdminMfaAssertionDto {}
