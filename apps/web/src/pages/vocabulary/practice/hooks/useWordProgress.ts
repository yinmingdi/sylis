import type { DailyPlanWordDto } from '@sylis/shared/dto';
import { FirstRoundChoice } from '@sylis/shared/dto';
import { useMemo, useCallback } from 'react';

/**
 * Hook: 计算单词学习进度
 */
export const useWordProgress = (
  allWords: DailyPlanWordDto[],
  learnedWordsInRound: Set<string>,
) => {
  // 计算已完成的单词数
  const completedCount = useMemo(() => {
    return allWords.filter((word) => word.dailyProgress?.isCompletedToday)
      .length;
  }, [allWords]);

  // 计算需要继续学习的单词
  const wordsNeedingMorePractice = useMemo(() => {
    return allWords.filter((word) => {
      const progress = word.dailyProgress;
      if (!progress) return true;

      // 如果已完成，不需要继续
      if (progress.isCompletedToday) return false;

      // 如果还没完成，需要继续
      return true;
    });
  }, [allWords]);

  // 计算当前轮次信息
  const roundProgress = useMemo(() => {
    const WORDS_PER_ROUND = 5;
    const totalRounds = Math.ceil(allWords.length / WORDS_PER_ROUND);
    const currentRound =
      Math.floor(learnedWordsInRound.size / WORDS_PER_ROUND) + 1;

    return {
      currentRound,
      totalRounds,
      wordsInCurrentRound: learnedWordsInRound.size % WORDS_PER_ROUND,
    };
  }, [allWords.length, learnedWordsInRound.size]);

  // 检查单词是否需要继续练习
  const needsMorePractice = useCallback((word: DailyPlanWordDto) => {
    const progress = word.dailyProgress;
    if (!progress) return true;

    // 已完成
    if (progress.isCompletedToday) return false;

    // 点了"不认识" 且答对次数 < 3
    if (
      progress.firstRoundChoice === FirstRoundChoice.NOT_RECOGNIZED &&
      progress.correctCount < 3
    ) {
      return true;
    }

    // 点了"认识" 且答对次数 < 1
    if (
      progress.firstRoundChoice === FirstRoundChoice.RECOGNIZED &&
      progress.correctCount < 1
    ) {
      return true;
    }

    return false;
  }, []);

  return {
    completedCount,
    wordsNeedingMorePractice,
    roundProgress,
    needsMorePractice,
  };
};
