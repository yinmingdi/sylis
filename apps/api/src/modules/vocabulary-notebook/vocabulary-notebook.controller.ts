import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';

import {
  AddWordToNotebookReqDto,
  AddWordToNotebookResDto,
} from './dto/add-word.dto';
import {
  CreateNotebookReqDto,
  CreateNotebookResDto,
} from './dto/create-notebook.dto';
import {
  GetNotebookWordsReqDto,
  GetNotebookWordsResDto,
} from './dto/get-notebook-words.dto';
import { GetNotebooksResDto, NotebookItemDto } from './dto/get-notebooks.dto';
import {
  UpdateCollectedWordReqDto,
  UpdateCollectedWordResDto,
} from './dto/update-collected-word.dto';
import {
  UpdateNotebookReqDto,
  UpdateNotebookResDto,
} from './dto/update-notebook.dto';
import { VocabularyNotebookService } from './vocabulary-notebook.service';
@ApiTags('生词本')
@Controller('vocabulary-notebooks')
export class VocabularyNotebookController {
  constructor(
    private readonly vocabularyNotebookService: VocabularyNotebookService,
  ) {}

  // ==================== 快捷操作（默认生词本）- 必须放在参数化路由之前 ====================

  @Post('default/words')
  @ApiOperation({ summary: '添加单词到默认生词本' })
  @ApiResponse({ type: AddWordToNotebookResDto })
  async addWordToDefaultNotebook(
    @Body() dto: AddWordToNotebookReqDto,
    @Req() req: Request,
  ): Promise<AddWordToNotebookResDto> {
    return this.vocabularyNotebookService.addWordToDefaultNotebook(
      req.user!.id,
      dto,
    );
  }

  @Delete('default/words/:wordId')
  @ApiOperation({ summary: '从默认生词本移除单词' })
  async removeWordFromDefaultNotebook(
    @Param('wordId') wordId: string,
    @Req() req: Request,
  ) {
    return this.vocabularyNotebookService.removeWordFromDefaultNotebook(
      req.user!.id,
      wordId,
    );
  }

  // ==================== 生词本管理 ====================

  @Post()
  @ApiOperation({ summary: '创建生词本' })
  @ApiResponse({ type: CreateNotebookResDto })
  async createNotebook(
    @Body() dto: CreateNotebookReqDto,
    @Req() req: Request,
  ): Promise<CreateNotebookResDto> {
    return this.vocabularyNotebookService.createNotebook(req.user!.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取用户所有生词本' })
  @ApiResponse({ type: GetNotebooksResDto })
  async getUserNotebooks(@Req() req: Request): Promise<GetNotebooksResDto> {
    return this.vocabularyNotebookService.getUserNotebooks(req.user!.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取生词本详情' })
  @ApiResponse({ type: NotebookItemDto })
  async getNotebookById(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<NotebookItemDto> {
    return this.vocabularyNotebookService.getNotebookById(req.user!.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新生词本信息' })
  @ApiResponse({ type: UpdateNotebookResDto })
  async updateNotebook(
    @Param('id') id: string,
    @Body() dto: UpdateNotebookReqDto,
    @Req() req: Request,
  ): Promise<UpdateNotebookResDto> {
    return this.vocabularyNotebookService.updateNotebook(req.user!.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除生词本' })
  async deleteNotebook(@Param('id') id: string, @Req() req: Request) {
    return this.vocabularyNotebookService.deleteNotebook(req.user!.id, id);
  }

  // ==================== 收藏单词管理 ====================

  @Post(':id/words')
  @ApiOperation({ summary: '添加单词到生词本' })
  @ApiResponse({ type: AddWordToNotebookResDto })
  async addWordToNotebook(
    @Param('id') id: string,
    @Body() dto: AddWordToNotebookReqDto,
    @Req() req: Request,
  ): Promise<AddWordToNotebookResDto> {
    return this.vocabularyNotebookService.addWordToNotebook(
      req.user!.id,
      id,
      dto,
    );
  }

  @Get(':id/words')
  @ApiOperation({ summary: '获取生词本的单词列表' })
  @ApiResponse({ type: GetNotebookWordsResDto })
  async getNotebookWords(
    @Param('id') id: string,
    @Query() dto: GetNotebookWordsReqDto,
    @Req() req: Request,
  ): Promise<GetNotebookWordsResDto> {
    return this.vocabularyNotebookService.getNotebookWords(
      req.user!.id,
      id,
      dto,
    );
  }

  @Patch(':id/words/:wordId')
  @ApiOperation({ summary: '更新收藏单词信息' })
  @ApiResponse({ type: UpdateCollectedWordResDto })
  async updateCollectedWord(
    @Param('id') id: string,
    @Param('wordId') wordId: string,
    @Body() dto: UpdateCollectedWordReqDto,
    @Req() req: Request,
  ): Promise<UpdateCollectedWordResDto> {
    return this.vocabularyNotebookService.updateCollectedWord(
      req.user!.id,
      id,
      wordId,
      dto,
    );
  }

  @Delete(':id/words/:wordId')
  @ApiOperation({ summary: '从生词本移除单词' })
  async removeWordFromNotebook(
    @Param('id') id: string,
    @Param('wordId') wordId: string,
    @Req() req: Request,
  ) {
    return this.vocabularyNotebookService.removeWordFromNotebook(
      req.user!.id,
      id,
      wordId,
    );
  }

  @Get(':id/stats')
  @ApiOperation({ summary: '获取生词本统计信息' })
  async getNotebookStats(@Param('id') id: string, @Req() req: Request) {
    return this.vocabularyNotebookService.getNotebookStats(req.user!.id, id);
  }
}
