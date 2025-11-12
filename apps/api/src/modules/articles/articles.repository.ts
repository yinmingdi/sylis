import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateArticleReqDto } from './dto/create-article.dto';
import { GetArticlesReqDto } from './dto/get-articles.dto';

@Injectable()
export class ArticlesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createArticle(userId: string, data: CreateArticleReqDto) {
    return this.prismaService.article.create({
      data: {
        ...data,
        userId,
        usedWords: data.usedWords || [],
      },
    });
  }

  async getArticles(userId: string, filters: GetArticlesReqDto) {
    const where: any = {
      userId,
    };

    if (filters.difficulty) {
      where.difficulty = filters.difficulty;
    }

    if (filters.theme) {
      where.theme = filters.theme;
    }

    if (filters.articleType) {
      where.articleType = filters.articleType;
    }

    if (filters.length) {
      where.length = filters.length;
    }

    const [articles, total] = await Promise.all([
      this.prismaService.article.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prismaService.article.count({ where }),
    ]);

    return { articles, total };
  }

  async getArticleById(id: string, userId: string) {
    return this.prismaService.article.findFirst({
      where: {
        id,
        userId,
      },
    });
  }

  async deleteArticle(id: string, userId: string) {
    return this.prismaService.article.deleteMany({
      where: {
        id,
        userId,
      },
    });
  }
}
