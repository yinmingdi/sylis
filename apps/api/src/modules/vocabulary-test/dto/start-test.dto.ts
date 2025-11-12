import { IsOptional, IsInt, Min } from 'class-validator';

import { QuizChoiceDataDto, QuizWordInfoDto } from '../../quiz/dto/quiz.dto';

/**
 * 开始测试请求 DTO
 */
export class StartTestReqDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  questionCount?: number; // 题目数量，默认10题
}

/**
 * 测试题目 DTO（包含单词信息和选择题数据）
 */
export class TestQuestionDto {
  word: QuizWordInfoDto; // 单词信息
  quizData: QuizChoiceDataDto; // 选择题数据
  difficulty: string; // 难度等级
}

/**
 * 开始测试响应 DTO
 */
export class StartTestResDto {
  testId: string; // 测试ID
  questions: TestQuestionDto[]; // 题目列表
  totalCount: number; // 总题数
  timeLimit: number; // 每题限时（秒）
}
