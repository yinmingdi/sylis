import { IsArray, ValidateNested, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 答题记录 DTO
 */
export class TestAnswerDto {
  @IsString()
  wordId: string; // 单词ID

  @IsString()
  questionWord: string; // 题目单词

  @IsString()
  selectedWordId: string; // 用户选择的单词ID

  @IsString()
  answerWordId: string; // 正确答案的单词ID

  @IsString()
  difficulty: string; // 难度

  @IsInt()
  @Min(0)
  timeSpent: number; // 该题用时
}

/**
 * 完成测试请求 DTO
 */
export class CompleteTestReqDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestAnswerDto)
  answers: TestAnswerDto[]; // 所有答题记录
}

/**
 * 完成测试响应 DTO
 */
export class CompleteTestResDto {
  testId: string; // 测试ID
  score: number; // 分数
  correctCount: number; // 正确题数
  totalCount: number; // 总题数
  level: string; // 水平等级
  estimatedVocabulary: number; // 预估词汇量
  timeSpent: number; // 总用时
  completedAt: Date; // 完成时间
}
