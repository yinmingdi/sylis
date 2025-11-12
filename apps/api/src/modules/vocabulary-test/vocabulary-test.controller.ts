import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';

import {
  CompleteTestReqDto,
  CompleteTestResDto,
} from './dto/complete-test.dto';
import { GetTestDetailResDto } from './dto/get-test-detail.dto';
import {
  GetTestHistoryReqDto,
  GetTestHistoryResDto,
} from './dto/get-test-history.dto';
import { StartTestReqDto, StartTestResDto } from './dto/start-test.dto';
import { VocabularyTestService } from './vocabulary-test.service';
@ApiTags('词汇量测试')
@Controller('vocabulary-tests')
export class VocabularyTestController {
  constructor(private readonly vocabularyTestService: VocabularyTestService) {}

  @Post('start')
  @ApiOperation({ summary: '开始词汇量测试' })
  @ApiResponse({ type: StartTestResDto })
  async startTest(
    @Body() dto: StartTestReqDto,
    @Req() req: Request,
  ): Promise<StartTestResDto> {
    return this.vocabularyTestService.startTest(req.user!.id, dto);
  }

  @Post(':testId/complete')
  @ApiOperation({ summary: '完成词汇量测试' })
  @ApiResponse({ type: CompleteTestResDto })
  async completeTest(
    @Param('testId') testId: string,
    @Body() dto: CompleteTestReqDto,
    @Req() req: Request,
  ): Promise<CompleteTestResDto> {
    return this.vocabularyTestService.completeTest(req.user!.id, testId, dto);
  }

  @Get('history')
  @ApiOperation({ summary: '获取测试历史' })
  @ApiResponse({ type: GetTestHistoryResDto })
  async getTestHistory(
    @Query() dto: GetTestHistoryReqDto,
    @Req() req: Request,
  ): Promise<GetTestHistoryResDto> {
    return this.vocabularyTestService.getTestHistory(req.user!.id, dto);
  }

  @Get(':testId')
  @ApiOperation({ summary: '获取测试详情' })
  @ApiResponse({ type: GetTestDetailResDto })
  async getTestDetail(
    @Param('testId') testId: string,
    @Req() req: Request,
  ): Promise<GetTestDetailResDto> {
    return this.vocabularyTestService.getTestDetail(req.user!.id, testId);
  }

  @Delete(':testId')
  @ApiOperation({ summary: '删除测试记录' })
  async deleteTest(@Param('testId') testId: string, @Req() req: Request) {
    return this.vocabularyTestService.deleteTest(req.user!.id, testId);
  }
}
