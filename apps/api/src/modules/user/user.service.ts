import { Injectable } from '@nestjs/common';

import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  // 用户相关的业务逻辑方法
  // 例如：获取用户信息、更新用户信息等
}
