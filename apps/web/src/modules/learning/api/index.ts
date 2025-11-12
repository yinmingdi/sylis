import type {
  BatchUpdateWordsReqDto,
  GetCurrentBookResDto,
  GetDailyPlanReqDto,
  GetDailyPlanResDto,
  LearningStatsResDto,
  UpdateWordStatusReqDto,
} from '@sylis/shared/dto';

import { request } from '../../../network/request';

// 获取学习统计数据
export const getLearningStats = () => {
  return request<never, LearningStatsResDto>({
    url: '/learning/stats',
    method: 'GET',
  });
};

// 获取当前学习书籍信息
export const getCurrentBook = () => {
  return request<never, GetCurrentBookResDto>({
    url: '/learning/current-book',
    method: 'GET',
  });
};

// 获取今日学习进度
export const getTodayProgress = () => {
  return request<never, { completed: number; total: number }>({
    url: '/learning/today-progress',
    method: 'GET',
  });
};

// 获取每日学习计划
export const getDailyPlan = (params: GetDailyPlanReqDto) => {
  return request<GetDailyPlanReqDto, GetDailyPlanResDto>({
    url: '/learning/daily-plan',
    method: 'GET',
    data: params,
  });
};

// 更新单词学习状态
export const updateWordStatus = (data: UpdateWordStatusReqDto) => {
  return request<UpdateWordStatusReqDto, void>({
    url: '/learning/word-status',
    method: 'PATCH',
    data,
  });
};

// 批量更新单词学习状态
export const batchUpdateWordStatus = (data: BatchUpdateWordsReqDto) => {
  return request<BatchUpdateWordsReqDto, void>({
    url: '/learning/batch-word-status',
    method: 'PATCH',
    data,
  });
};

// 学习API对象，用于更方便的调用
export const learningApi = {
  getLearningStats,
  getCurrentBook,
  getTodayProgress,
  getDailyPlan,
  updateWordStatus,
  batchUpdateWordStatus,
};
