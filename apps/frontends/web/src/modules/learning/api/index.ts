import { apiClient } from '@sylis/api-client/user';

import type {
  BatchUpdateWordsReqDto,
  GetCurrentBookResDto,
  GetDailyPlanReqDto,
  GetDailyPlanResDto,
  LearningStatsResDto,
  UpdateWordStatusReqDto,
} from '@/legacy-dto';

import {
  fetchLegacyDailyPlan,
  persistLegacyWordProgress,
} from './modern-study-adapter';
import { fetchLegacyCurrentBook } from '../../books/api/modern-book-adapter';

const response = <T>(data: T) => ({ data, message: 'ok', code: 0 });
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

// 获取学习统计数据
export const getLearningStats = async () => {
  const [statsValue, currentBook] = await Promise.all([
    apiClient.study.stats(),
    fetchLegacyCurrentBook(),
  ]);
  const stats = asRecord(statsValue);
  return response<LearningStatsResDto>({
    checkInDays: count(stats.reviews) > 0 ? 1 : 0,
    learningProgress: currentBook.progress,
    newWordsLearned: count(stats.attempts),
    reviewWords: count(stats.reviews),
  });
};

// 获取当前学习书籍信息
export const getCurrentBook = async () =>
  response<GetCurrentBookResDto>(await fetchLegacyCurrentBook());

// 获取今日学习进度
export const getTodayProgress = async () => {
  const plan = asRecord(await apiClient.study.today());
  const items = asArray(plan.items).map(asRecord);
  return response({
    completed: items.filter((item) => Boolean(item.completedAt)).length,
    total: items.length,
  });
};

// 获取每日学习计划
export const getDailyPlan = async (params: GetDailyPlanReqDto) =>
  response<GetDailyPlanResDto>(await fetchLegacyDailyPlan(params.bookId));

// 更新单词学习状态
export const updateWordStatus = async (data: UpdateWordStatusReqDto) => {
  await persistLegacyWordProgress(data);
  return response<void>(undefined);
};

// 批量更新单词学习状态
export const batchUpdateWordStatus = async (data: BatchUpdateWordsReqDto) => {
  await Promise.all(data.words.map(persistLegacyWordProgress));
  return response<void>(undefined);
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
