import { useCallback } from 'react';

import type { DailyPlanWordDto } from '@/legacy-dto';
import { FirstRoundChoice, WordLearningStatus } from '@/legacy-dto';

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
        planItemId: word.planItemId,
        wordHeadword: word.headword,
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
    async (
      word: DailyPlanWordDto,
      isCorrect: boolean,
      selectedWordId?: string,
    ) => {
      const selectedOption = word.quizChoice?.options.find(
        (option) => option.wordId === selectedWordId,
      );
      await updateWordStatus({
        wordId: word.id,
        planItemId: word.planItemId,
        wordHeadword: word.headword,
        answerText: selectedOption?.headword,
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
