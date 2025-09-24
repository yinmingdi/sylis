import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import * as bcryptjs from 'bcryptjs';

import { AuthRepository } from './auth.repository';
import { generateVerificationCode } from '../../utils';
import { UserRepository } from '../user/user.repository';
import { LoginReqDto } from './dto/login.dto';
import { RegisterReqDto } from './dto/register.dto';
@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userRepository: UserRepository,
    private readonly mailerService: MailerService,
    private readonly jwtService: JwtService,
  ) {}

  async sendEmailCode(email: string) {
    // 1.检测用户是否注册
    const user = await this.userRepository.findByEmail(email);
    if (user) {
      throw new BadRequestException('用户已存在');
    }

    // 2. 限制频率（如60秒内只能发一次）
    const limit = await this.authRepository.getEmailCodeLimit(email);
    if (limit) {
      throw new BadRequestException('请勿频繁请求验证码');
    }

    // 3. 生成验证码
    const code = generateVerificationCode();

    // 4. 存入 redis，5分钟有效
    await this.authRepository.setEmailCode(email, code);
    await this.authRepository.setEmailCodeLimit(email); // 1分钟内不能重复发

    // 5. 发送邮件
    await this.mailerService.sendMail({
      from: process.env.MAILER_USER,
      to: email,
      subject: '【Sylis】注册验证码',
      template: 'register', // 对应 register.hbs
      context: {
        code,
        expireMinutes: 5,
        appName: 'Sylis',
      },
    });

    return { message: '验证码已发送' };
  }

  async register(dto: RegisterReqDto) {
    // 1. 校验验证码
    const redisCode = await this.authRepository.getEmailCode(dto.email);
    if (!redisCode || redisCode !== dto.code) {
      throw new BadRequestException('验证码错误或已过期');
    }

    // 2. 检查邮箱是否已注册
    const existUser = await this.userRepository.findByEmail(dto.email);
    if (existUser) {
      throw new BadRequestException('邮箱已注册');
    }

    // 3. 加密密码 (使用简单的哈希，实际项目中建议使用 bcrypt)
    const hashedPassword = bcryptjs.hashSync(dto.password, 10);

    // 4. 创建用户
    const user = await this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
    });

    // 5. 删除验证码
    await this.authRepository.delEmailCode(dto.email);
    await this.authRepository.delEmailCodeLimit(dto.email);

    return {
      message: '注册成功',
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async login(dto: LoginReqDto) {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const compareRes = bcryptjs.compareSync(dto.password, user.password);
    if (!compareRes) {
      throw new BadRequestException('密码错误');
    }

    const token = this.jwtService.sign({ id: user.id, email: user.email });
    return { token };
  }
}
