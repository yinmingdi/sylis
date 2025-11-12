import { IsInt, IsString, Min } from 'class-validator';

/**
 * 提交答案请求 DTO
 */
export class SubmitAnswerReqDto {
  @IsString()
  questionWord: string; // 题目单词

  @IsInt()
  @Min(-1)
  userAnswer: number; // 用户答案索引，-1表示超时未答

  @IsInt()
  @Min(0)
  timeSpent: number; // 该题用时（秒）
}

/**
 * 提交答案响应 DTO
 */
export class SubmitAnswerResDto {
  success: boolean; // 是否成功
  isCorrect: boolean; // 是否正确
}

