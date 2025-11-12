import { Module } from '@nestjs/common';

import { ArticleGenerationService } from './article-generation.service';
import { ArticlesController } from './articles.controller';
import { ArticlesRepository } from './articles.repository';
import { ArticlesService } from './articles.service';
import { AIModule } from '../ai/ai.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [AIModule, LearningModule],
  controllers: [ArticlesController],
  providers: [ArticlesService, ArticlesRepository, ArticleGenerationService],
  exports: [ArticlesService, ArticlesRepository, ArticleGenerationService],
})
export class ArticlesModule {}
