import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

export enum CollectionSource {
  MANUAL = 'MANUAL',
  READING = 'READING',
  QUIZ = 'QUIZ',
  AI_CHAT = 'AI_CHAT',
  LISTENING = 'LISTENING',
  WRITING = 'WRITING',
}

export class AddWordToNotebookReqDto {
  @ApiProperty({ description: '单词ID' })
  @IsString()
  wordId: string;

  @ApiProperty({
    description: '来源',
    enum: CollectionSource,
    required: false,
  })
  @IsOptional()
  @IsEnum(CollectionSource)
  source?: CollectionSource;

  @ApiProperty({
    description: '上下文',
    required: false,
    example: 'I saw this word in the article about...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;

  @ApiProperty({ description: '笔记', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({
    description: '标签',
    required: false,
    type: [String],
    example: ['重点', '易混淆'],
  })
  @IsOptional()
  tags?: string[];
}

export class AddWordToNotebookResDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '收藏记录ID' })
  collectedWordId: string;
}
