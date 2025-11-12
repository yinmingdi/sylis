import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';

import { ArticleGenerationService } from './article-generation.service';
import { ArticlesService } from './articles.service';
import {
  GenerateReadingReqDto,
  GenerateReadingResDto,
} from './dto/article-generation.dto';
import { CreateArticleReqDto } from './dto/create-article.dto';
import { CreateArticleResDto } from './dto/create-article.dto';
import { GetArticlesResDto } from './dto/get-articles-res.dto';
import { GetArticlesReqDto } from './dto/get-articles.dto';

@ApiTags('文章管理')
@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleGenerationService: ArticleGenerationService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建文章' })
  @ApiResponse({
    status: 201,
    description: '文章创建成功',
    type: CreateArticleResDto,
  })
  async createArticle(@Req() req: Request, @Body() data: CreateArticleReqDto) {
    const userId = (req as any).user.id;
    return this.articlesService.createArticle(userId, data);
  }

  @Post('generate')
  @ApiOperation({ summary: '生成阅读文章' })
  @ApiResponse({
    status: 200,
    description: '生成成功',
    type: GenerateReadingResDto,
  })
  async generateReading(
    @Body() params: GenerateReadingReqDto,
  ): Promise<GenerateReadingResDto> {
    if (!params.words || params.words.length === 0) {
      throw new BadRequestException('请至少选择一个单词');
    }
    return await this.articleGenerationService.generateArticle({
      words: params.words,
      difficulty: params.difficulty,
      theme: params.theme,
      length: params.length,
      articleType: params.articleType,
    });
  }

  @Post('generate-and-save')
  @ApiOperation({ summary: '生成并保存阅读文章' })
  @ApiResponse({ status: 201, description: '生成并保存成功' })
  async generateAndSaveReading(
    @Req() req: Request,
    @Body() params: GenerateReadingReqDto,
  ) {
    const userId = (req as any).user.id;
    return this.articleGenerationService.generateAndSaveArticle(userId, params);
  }

  @Get()
  @ApiOperation({ summary: '获取文章列表' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: GetArticlesResDto,
  })
  async getArticles(@Req() req: Request, @Query() filters: GetArticlesReqDto) {
    const userId = (req as any).user.id;
    return this.articlesService.getArticles(userId, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取文章详情' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: CreateArticleResDto,
  })
  async getArticleById(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.id;
    return this.articlesService.getArticleById(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除文章' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteArticle(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.id;
    return this.articlesService.deleteArticle(id, userId);
  }
}
