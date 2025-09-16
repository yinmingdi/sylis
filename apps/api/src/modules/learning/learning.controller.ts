import { Body, Controller, Post, Req, Get, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { AddBookReqDto } from './dto/addBook.dto';
import { LearningService } from './learning.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetCurrentBookResDto } from './dto/currentBook.dto';

@UseGuards(JwtAuthGuard)
@Controller('learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Post('add-book')
  async addBook(@Body() dto: AddBookReqDto, @Req() req: Request) {
    return this.learningService.addBook(dto, req.user!.id);
  }

  @Get('current-book')
  dashboard(@Req() req: Request): Promise<GetCurrentBookResDto> {
    return this.learningService.getCurrentBook(req.user!.id);
  }
}
