import type { DailyPlanWordDto } from '@sylis/shared/dto';
import { FirstRoundChoice, WordLearningStatus } from '@sylis/shared/dto';
import { useCallback } from 'react';

import { updateWordStatus } from '../../../../modules/learning/api';

/**
 * Hook: 管理单词学习的操作行为
 */
export const useWordActions = () => {
  /**
   * 处理第一轮识别：认识/不认识
   */
  const handleRecognizeWord = useCallback(
    async (word: DailyPlanWordDto, recognized: boolean) => {
      const firstRoundChoice = recognized
        ? FirstRoundChoice.RECOGNIZED
        : FirstRoundChoice.NOT_RECOGNIZED;

      await updateWordStatus({
        wordId: word.id,
        status: WordLearningStatus.LEARNING,
        isCorrect: recognized, // 认识视为答对
        firstRoundChoice,
      });

      return firstRoundChoice;
    },
    [],
  );

  /**
   * 处理测验答题
   */
  const handleQuizAnswer = useCallback(
    async (word: DailyPlanWordDto, isCorrect: boolean) => {
      await updateWordStatus({
        wordId: word.id,
        status: WordLearningStatus.LEARNING,
        isCorrect,
      });

      // 返回是否完成
      const dailyProgress = word.dailyProgress;
      if (!dailyProgress) return false;

      const newCorrectCount = isCorrect
        ? dailyProgress.correctCount + 1
        : dailyProgress.correctCount;

      return newCorrectCount >= dailyProgress.requiredCorrectCount;
    },
    [],
  );

  /**
   * 标记单词为掌握
   */
  const handleMarkMastered = useCallback(async (wordId: string) => {
    await updateWordStatus({
      wordId,
      status: WordLearningStatus.MASTERED,
      isCorrect: true,
    });
  }, []);

  return {
    handleRecognizeWord,
    handleQuizAnswer,
    handleMarkMastered,
  };
};
