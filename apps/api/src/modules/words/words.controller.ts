import { Body, Controller, Get, Post, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { SearchWordReqDto, SearchWordResDto } from './dto/search-word.dto';
import { TranslateTextReqDto } from './dto/translate.dto';
import { WordDetailResDto } from './dto/word-detail.dto';
import { WordsService } from './words.service';
@ApiTags('单词模块')
@Controller('words')
export class WordsController {
  constructor(private readonly wordsService: WordsService) {}

  @Get('search')
  @ApiOperation({ summary: '搜索单词' })
  @ApiResponse({ type: [SearchWordResDto] })
  async searchWords(
    @Query() dto: SearchWordReqDto,
  ): Promise<SearchWordResDto[]> {
    return this.wordsService.searchWords(dto);
  }

  @Post('translate')
  @ApiOperation({
    summary: '翻译文字（单词或句子），如果数据库没有则使用AI翻译',
  })
  @ApiResponse({ type: WordDetailResDto })
  async translateText(
    @Body() dto: TranslateTextReqDto,
  ): Promise<WordDetailResDto> {
    return this.wordsService.translateText(dto);
  }

  @Get(':wordOrId')
  @ApiOperation({ summary: '获取单词详情（支持单词文本或ID）' })
  @ApiResponse({ type: WordDetailResDto })
  async getWordDetail(
    @Param('wordOrId') wordOrId: string,
  ): Promise<WordDetailResDto> {
    return this.wordsService.getWordDetail(wordOrId);
  }
}
