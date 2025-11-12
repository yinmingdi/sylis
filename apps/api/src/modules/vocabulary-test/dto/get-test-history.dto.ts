import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 获取测试历史请求 DTO
 */
export class GetTestHistoryReqDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

/**
 * 测试历史项 DTO
 */
export class TestHistoryItemDto {
  id: string; // 测试ID
  score: number; // 分数
  correctCount: number; // 正确题数
  totalCount: number; // 总题数
  level: string; // 水平等级
  estimatedVocabulary: number; // 预估词汇量
  timeSpent: number; // 用时（秒）
  completedAt: Date; // 完成时间
}

/**
 * 获取测试历史响应 DTO
 */
export class GetTestHistoryResDto {
  tests: TestHistoryItemDto[]; // 测试列表
  total: number; // 总数
  page: number; // 当前页
  limit: number; // 每页数量
}

