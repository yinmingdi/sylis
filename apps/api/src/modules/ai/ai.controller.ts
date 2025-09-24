import { Body, Controller, Post } from '@nestjs/common';

import { AIService } from './ai.service';
import { GenerateReadingReqDto, GenerateReadingResDto } from './dto/exam.dto';
import {
  ParseGrammarReqDto,
  ParseGrammarResDto,
  ParseMultipleGrammarReqDto,
  ParseMultipleGrammarResDto,
} from './dto/grammar.dto';
import { TestConnectionReqDto, TestConnectionResDto } from './dto/test.dto';
import { GrammarAnalysisService } from './grammar-analysis.service';
import { ReadingGenerationService } from './reading-generation.service';

@Controller('ai')
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly readingGenerationService: ReadingGenerationService,
    private readonly grammarAnalysisService: GrammarAnalysisService,
  ) {}

  @Post('generate-reading')
  async generateReading(
    @Body() params: GenerateReadingReqDto,
  ): Promise<GenerateReadingResDto> {
    return await this.readingGenerationService.generateReading(params);
  }

  @Post('parse-grammar')
  async parseGrammar(
    @Body() params: ParseGrammarReqDto,
  ): Promise<ParseGrammarResDto> {
    return await this.grammarAnalysisService.parseGrammar(params);
  }

  @Post('parse-multiple-grammar')
  async parseMultipleGrammar(
    @Body() params: ParseMultipleGrammarReqDto,
  ): Promise<ParseMultipleGrammarResDto> {
    return await this.grammarAnalysisService.parseMultipleGrammar(params);
  }

  @Post('test-connection')
  async testConnection(
    @Body() params: TestConnectionReqDto,
  ): Promise<TestConnectionResDto> {
    return await this.aiService.testConnection(params);
  }
}
