import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { Public } from '../../decorators';
import { LoginReqDto } from './dto/login.dto';
import { RegisterReqDto } from './dto/register.dto';
import { SendEmailCodeReqDto } from './dto/send-email-code.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('send-email-code')
  @ApiOperation({ summary: '发送邮箱验证码' })
  @ApiResponse({ status: 200, description: '验证码发送成功' })
  @ApiResponse({ status: 400, description: '邮箱格式错误或请求过于频繁' })
  async sendEmailCode(@Body() dto: SendEmailCodeReqDto) {
    return this.authService.sendEmailCode(dto.email);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 400, description: '验证码错误或邮箱已注册' })
  async register(@Body() dto: RegisterReqDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  async login(@Body() dto: LoginReqDto) {
    return this.authService.login(dto);
  }
}
