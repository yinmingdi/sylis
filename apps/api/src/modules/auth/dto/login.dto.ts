import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginReqDto {
  @ApiProperty({ description: '邮箱' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class LoginResDto {
  @ApiProperty({ description: 'token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
