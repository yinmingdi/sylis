import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findByEmail(email: string) {
    return this.prismaService.user.findUnique({
      where: { email },
    });
  }

  create(data: { email: string; password: string }) {
    return this.prismaService.user.create({
      data: {
        email: data.email,
        password: data.password,
        userLearning: {
          create: {},
        },
      },
    });
  }
}
