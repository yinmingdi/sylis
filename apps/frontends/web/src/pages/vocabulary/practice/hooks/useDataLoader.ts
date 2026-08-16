import { useCallback } from 'react';

import type { DailyPlanWordDto, GetDailyPlanResDto } from '@/legacy-dto';

import { getNewWords, getReviewWords } from '../../../../modules/books/api';
import { getDailyPlan } from '../../../../modules/learning/api';

export interface EnrichedDailyPlan extends GetDailyPlanResDto {
  allWords: DailyPlanWordDto[]; // 所有未完成的单词
}

/**
 * Hook: 管理数据加载
 */
export const useDataLoader = () => {
  /**
   * 加载每日学习计划
   */
  const loadDailyPlan = useCallback(
    async (
      bookId: string,
      date?: string,
      regenerate?: boolean,
      type?: 'new' | 'review',
    ): Promise<EnrichedDailyPlan> => {
      if (!bookId || bookId.trim() === '') {
        throw new Error('请先选择学习书籍');
      }

      let newWords: DailyPlanWordDto[] = [];
      let reviewWords: DailyPlanWordDto[] = [];
      let plannedNewCount = 0;
      let plannedReviewCount = 0;
      let completedNewCount = 0;
      let completedReviewCount = 0;
      let responseDate = '';

      // ⭐️ 根据 type 参数调用不同的接口
      if (type === 'new') {
        // 只获取新单词
        const response = await getNewWords({
          bookId,
          date,
          regenerate,
        });
        newWords = response.data.words;
        plannedNewCount = response.data.plannedCount;
        completedNewCount = response.data.completedCount;
        responseDate = response.data.date;
      } else if (type === 'review') {
        // 只获取复习单词
        const response = await getReviewWords({
          bookId,
          date,
          regenerate,
        });
        reviewWords = response.data.words;
        plannedReviewCount = response.data.plannedCount;
        completedReviewCount = response.data.completedCount;
        responseDate = response.data.date;
      } else {
        // 默认：获取全部（原有逻辑）
        const response = await getDailyPlan({
          bookId,
          date,
          regenerate,
        });
        newWords = response.data.newWords;
        reviewWords = response.data.reviewWords;
        plannedNewCount = response.data.plannedNewCount;
        plannedReviewCount = response.data.plannedReviewCount;
        completedNewCount = response.data.completedNewCount;
        completedReviewCount = response.data.completedReviewCount;
        responseDate = response.data.date;
      }

      // 过滤出未完成的单词
      const unfinishedWords: DailyPlanWordDto[] = [
        ...newWords.filter(
          (w: DailyPlanWordDto) => !w.dailyProgress?.isCompletedToday,
        ),
        ...reviewWords.filter(
          (w: DailyPlanWordDto) => !w.dailyProgress?.isCompletedToday,
        ),
      ];

      return {
        newWords,
        reviewWords,
        plannedNewCount,
        plannedReviewCount,
        completedNewCount,
        completedReviewCount,
        date: responseDate,
        // 返回未完成的单词作为学习列表
        allWords: unfinishedWords,
      };
    },
    [],
  );

  return {
    loadDailyPlan,
  };
};
