import {
  Body,
  Controller,
  Post,
  Req,
  Get,
  UseGuards,
  Query,
  Patch,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';

import { DailyPlanService } from './daily-plan.service';
import { AddBookReqDto } from './dto/addBook.dto';
import { BookDetailResDto } from './dto/book-detail.dto';
import { LearningService } from './learning.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetCurrentBookResDto } from './dto/currentBook.dto';
import {
  GetDailyPlanReqDto,
  GetDailyPlanResDto,
  UpdateWordStatusReqDto,
  BatchUpdateWordsReqDto,
} from './dto/daily-plan.dto';
import { LearningStatsResDto } from './dto/learning-stats.dto';

@ApiTags('学习模块')
@UseGuards(JwtAuthGuard)
@Controller('learning')
export class LearningController {
  constructor(
    private readonly learningService: LearningService,
    private readonly dailyPlanService: DailyPlanService,
  ) {}

  @Post('add-book')
  @ApiOperation({ summary: '添加学习书籍' })
  async addBook(@Body() dto: AddBookReqDto, @Req() req: Request) {
    return this.learningService.addBook(dto, req.user!.id);
  }

  @Get('current-book')
  @ApiOperation({ summary: '获取当前学习书籍信息' })
  @ApiResponse({ type: GetCurrentBookResDto })
  dashboard(@Req() req: Request): Promise<GetCurrentBookResDto> {
    return this.learningService.getCurrentBook(req.user!.id);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取学习统计信息' })
  @ApiResponse({ type: LearningStatsResDto })
  async getLearningStats(@Req() req: Request): Promise<LearningStatsResDto> {
    return this.learningService.getLearningStats(req.user!.id);
  }

  @Get('today-progress')
  @ApiOperation({ summary: '获取今日学习进度' })
  async getTodayProgress(
    @Req() req: Request,
  ): Promise<{ completed: number; total: number }> {
    return this.learningService.getTodayProgress(req.user!.id);
  }

  @Get('daily-plan')
  @ApiOperation({ summary: '获取每日学习计划' })
  @ApiResponse({ type: GetDailyPlanResDto })
  async getDailyPlan(
    @Query() dto: GetDailyPlanReqDto,
    @Req() req: Request,
  ): Promise<GetDailyPlanResDto> {
    return this.dailyPlanService.getDailyPlan(req.user!.id, dto);
  }

  @Patch('word-status')
  @ApiOperation({ summary: '更新单词学习状态' })
  async updateWordStatus(
    @Body() dto: UpdateWordStatusReqDto,
    @Req() req: Request,
  ): Promise<void> {
    return this.dailyPlanService.updateWordStatus(req.user!.id, dto);
  }

  @Patch('batch-word-status')
  @ApiOperation({ summary: '批量更新单词学习状态' })
  async batchUpdateWordStatus(
    @Body() dto: BatchUpdateWordsReqDto,
    @Req() req: Request,
  ): Promise<void> {
    return this.dailyPlanService.batchUpdateWordStatus(req.user!.id, dto);
  }

  @Get('book-detail/:bookId')
  @ApiOperation({ summary: '获取书籍详情和用户学习设置' })
  @ApiResponse({ type: BookDetailResDto })
  async getBookDetail(
    @Param('bookId') bookId: string,
    @Req() req: Request,
  ): Promise<BookDetailResDto> {
    return this.learningService.getBookDetail(req.user!.id, bookId);
  }
}
