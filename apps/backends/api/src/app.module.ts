import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";

import { ApiConfigModule } from "./config/api-config.module";
import { AgentOperationsModule } from "./modules/agent-operations/agent-operations.module";
import { AssessmentsModule } from "./modules/assessments/assessments.module";
import { BooksModule } from "./modules/books/books.module";
import { ExercisesModule } from "./modules/exercises/exercises.module";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { LexiconModule } from "./modules/lexicon/lexicon.module";
import { NotebooksModule } from "./modules/notebooks/notebooks.module";
import { ReadingModule } from "./modules/reading/reading.module";
import { RedditModule } from "./modules/reddit/reddit.module";
import { StudyModule } from "./modules/study/study.module";
import { CsrfGuard } from "./platform/auth/csrf.guard";
import { SessionGuard } from "./platform/auth/session.guard";
import { DatabaseModule } from "./platform/database/database.module";
import { EncryptionModule } from "./platform/encryption/encryption.module";
import { ProblemDetailsFilter } from "./platform/http/problem-details.filter";
import { OutboxModule } from "./platform/outbox/outbox.module";

export const API_FEATURE_MODULES = [
  AgentOperationsModule,
  HealthModule,
  IdentityModule,
  JobsModule,
  LexiconModule,
  BooksModule,
  AssessmentsModule,
  ExercisesModule,
  StudyModule,
  NotebooksModule,
  ReadingModule,
  RedditModule,
] as const;

export const API_OPENAPI_MODULES = [
  ApiConfigModule,
  DatabaseModule,
  EncryptionModule,
  ...API_FEATURE_MODULES,
] as const;

@Module({
  imports: [...API_OPENAPI_MODULES, OutboxModule],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
