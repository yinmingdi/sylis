import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { validateEnvironment } from './config/env.validation';
import { HttpExceptionFilter } from './filter/http-exception/http-exception.filter';
import { TransformInterceptor } from './interceptor/transform/transform.interceptor';
import { AIModule } from './modules/ai/ai.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { BooksModule } from './modules/books/books.module';
import { ChatModule } from './modules/chat/chat.module';
import { HealthModule } from './modules/health/health.module';
import { LearningModule } from './modules/learning/learning.module';
import { LoggerModule } from './modules/logger/logger.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { RedditModule } from './modules/reddit/reddit.module';
import { RedisModule } from './modules/redis/redis.module';
import { UserModule } from './modules/user/user.module';
import { VocabularyNotebookModule } from './modules/vocabulary-notebook/vocabulary-notebook.module';
import { VocabularyTestModule } from './modules/vocabulary-test/vocabulary-test.module';
import { WordsModule } from './modules/words/words.module';
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
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['apps/api/.env', '.env'],
      validate: validateEnvironment,
    }),
    ...thirdPartyModules,
    PrismaModule,
    UserModule,
    AuthModule,
    RedisModule,
    BooksModule,
    ChatModule,
    HealthModule,
    LoggerModule,
    LearningModule,
    QuizModule,
    AIModule,
    ArticlesModule,
    WordsModule,
    VocabularyNotebookModule,
    VocabularyTestModule,
    RedditModule,
  ],
})
export class AppModule {}
