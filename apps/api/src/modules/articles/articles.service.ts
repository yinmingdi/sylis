import { Injectable, NotFoundException } from '@nestjs/common';

import { ArticlesRepository } from './articles.repository';
import { CreateArticleReqDto } from './dto/create-article.dto';
import { GetArticlesReqDto } from './dto/get-articles.dto';

@Injectable()
export class ArticlesService {
  constructor(private readonly articlesRepository: ArticlesRepository) {}

  async createArticle(userId: string, data: CreateArticleReqDto) {
    return this.articlesRepository.createArticle(userId, data);
  }

  async getArticles(userId: string, filters: GetArticlesReqDto) {
    return this.articlesRepository.getArticles(userId, filters);
  }

  async getArticleById(id: string, userId: string) {
    const article = await this.articlesRepository.getArticleById(id, userId);
    if (!article) {
      throw new NotFoundException('文章不存在');
    }
    return article;
  }

  async deleteArticle(id: string, userId: string) {
    const result = await this.articlesRepository.deleteArticle(id, userId);
    if (result.count === 0) {
      throw new NotFoundException('文章不存在');
    }
    return { message: '文章删除成功' };
  }
}
