import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const EMAIL_CODE_KEY = 'email:code:';
const EMAIL_CODE_LIMIT_KEY = 'email:code:limit:';
const EMAIL_CODE_EXPIRE_TIME = 300;

@Injectable()
export class AuthRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async setEmailCode(email: string, code: string) {
    await this.redisService.set(`${EMAIL_CODE_KEY}${email}`, code, EMAIL_CODE_EXPIRE_TIME);
  }

  async getEmailCode(email: string) {
    return this.redisService.get(`${EMAIL_CODE_KEY}${email}`);
  }

  async delEmailCode(email: string) {
    await this.redisService.del(`${EMAIL_CODE_KEY}${email}`);
  }

  async setEmailCodeLimit(email: string) {
    await this.redisService.set(`${EMAIL_CODE_LIMIT_KEY}${email}`, '1', EMAIL_CODE_EXPIRE_TIME);
  }

  async getEmailCodeLimit(email: string) {
    return this.redisService.get(`${EMAIL_CODE_LIMIT_KEY}${email}`);
  }

  async delEmailCodeLimit(email: string) {
    await this.redisService.del(`${EMAIL_CODE_LIMIT_KEY}${email}`);
  }
}
