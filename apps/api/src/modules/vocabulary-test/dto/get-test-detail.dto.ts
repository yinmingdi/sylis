/**
 * 答题详情 DTO
 */
export class TestAnswerDetailDto {
  questionWord: string; // 题目单词
  options: string[]; // 选项列表
  userAnswer: number; // 用户答案
  correctAnswer: number; // 正确答案
  isCorrect: boolean; // 是否正确
  difficulty: string; // 难度
  timeSpent: number; // 用时
}

/**
 * 获取测试详情响应 DTO
 */
export class GetTestDetailResDto {
  id: string; // 测试ID
  score: number; // 分数
  correctCount: number; // 正确题数
  totalCount: number; // 总题数
  level: string; // 水平等级
  estimatedVocabulary: number; // 预估词汇量
  timeSpent: number; // 总用时
  startedAt: Date; // 开始时间
  completedAt: Date; // 完成时间
  answers: TestAnswerDetailDto[]; // 答题详情
}

