import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
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

export class RegisterDto {
  @IsString()
  @Length(40, 2048)
  token!: string;

  @IsString()
  @Length(12, 128)
  password!: string;

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

export class UpdateUserDto {
  @IsString()
  @Length(2, 35)
  timezone!: string;

  @IsString()
  @Length(2, 35)
  locale!: string;
}

export class ConsentRecordDto {
  @IsString()
  @MaxLength(64)
  purpose!: string;

  @IsString()
  @MaxLength(64)
  policyVersion!: string;

  @IsIn(["GRANTED", "WITHDRAWN"])
  decision!: "GRANTED" | "WITHDRAWN";
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

  @IsIn(["TOTP", "WEBAUTHN"])
  method!: "TOTP" | "WEBAUTHN";

  @IsString()
  @IsOptional()
  code?: string;

  @IsObject()
  @IsOptional()
  response?: Record<string, unknown>;
}

export class DataExportDto {
  @IsObject()
  scope!: Record<string, unknown>;
}

export class AdminChallengeDto extends LoginDto {}

export class AdminSessionDto extends AdminMfaAssertionDto {}
