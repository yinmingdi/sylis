import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AIService } from './ai.service';
import {
  ParseGrammarReqDto,
  ParseGrammarResDto,
  ParseMultipleGrammarReqDto,
  ParseMultipleGrammarResDto,
} from './dto/grammar.dto';
import { TestConnectionReqDto, TestConnectionResDto } from './dto/test.dto';
import { GrammarAnalysisService } from './grammar-analysis.service';

@ApiTags('AI服务')
@Controller('ai')
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly grammarAnalysisService: GrammarAnalysisService,
  ) {}

  @Post('parse-grammar')
  @ApiOperation({ summary: '解析语法' })
  @ApiResponse({
    status: 200,
    description: '解析成功',
    type: ParseGrammarResDto,
  })
  async parseGrammar(
    @Body() params: ParseGrammarReqDto,
  ): Promise<ParseGrammarResDto> {
    return await this.grammarAnalysisService.parseGrammar(params);
  }

  @Post('parse-multiple-grammar')
  @ApiOperation({ summary: '批量解析语法' })
  @ApiResponse({
    status: 200,
    description: '解析成功',
    type: ParseMultipleGrammarResDto,
  })
  async parseMultipleGrammar(
    @Body() params: ParseMultipleGrammarReqDto,
  ): Promise<ParseMultipleGrammarResDto> {
    return await this.grammarAnalysisService.parseMultipleGrammar(params);
  }

  @Post('test-connection')
  @ApiOperation({ summary: '测试AI连接' })
  @ApiResponse({
    status: 200,
    description: '测试成功',
    type: TestConnectionResDto,
  })
  async testConnection(
    @Body() params: TestConnectionReqDto,
  ): Promise<TestConnectionResDto> {
    return await this.aiService.testConnection(params);
  }
}
