import { ApiProperty } from '@nestjs/swagger';
import { passwordRegExp } from '@sylis/utils';
import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterReqDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱地址不能为空' })
  email: string;

  @ApiProperty({
    description: '验证码',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  @Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })
  code: string;

  @ApiProperty({
    description: '密码',
    example: 'password123',
  })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码长度不能少于8位' })
  @MaxLength(20, { message: '密码长度不能超过20位' })
  @Matches(passwordRegExp, {
    message: '密码必须包含字母和数字',
  })
  password: string;
}

export class RegisterResDto {
  token: string;
}
