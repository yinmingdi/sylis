import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { HttpExceptionFilter } from './filter/http-exception/http-exception.filter';
import { TransformInterceptor } from './interceptor/transform/transform.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { BooksModule } from './modules/books/books.module';
import { LearningModule } from './modules/learning/learning.module';
import { LoggerModule } from './modules/logger/logger.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { UserModule } from './modules/user/user.module';
import { thirdPartyModules } from './third-party-modules';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
  imports: [
    ...thirdPartyModules,
    PrismaModule,
    UserModule,
    AuthModule,
    RedisModule,
    BooksModule,
    LoggerModule,
    LearningModule,
  ],
})
export class AppModule {}
