import type { DailyPlanWordDto } from '@sylis/shared/dto';
import { useState, useCallback, useMemo } from 'react';

const WORDS_PER_ROUND = 5; // 每轮5个单词

/**
 * Hook: 管理学习轮次
 * 实现需求：5个单词为一轮，学习完后进入测验
 */
export const useRoundManager = () => {
  const [learnedWordsInRound, setLearnedWordsInRound] = useState<Set<string>>(
    new Set(),
  );
  const [roundIndex, setRoundIndex] = useState(0);
  const [currentRoundWords, setCurrentRoundWords] = useState<
    DailyPlanWordDto[]
  >([]);

  // 开始新一轮
  const startNewRound = useCallback(
    (allWords: DailyPlanWordDto[], startIndex: number) => {
      const roundWords = allWords.slice(
        startIndex,
        startIndex + WORDS_PER_ROUND,
      );
      setCurrentRoundWords(roundWords);
      setRoundIndex(startIndex / WORDS_PER_ROUND);
      setLearnedWordsInRound(new Set());
    },
    [],
  );

  // 标记单词为已学习
  const markWordAsLearned = useCallback((wordId: string) => {
    setLearnedWordsInRound((prev) => new Set([...prev, wordId]));
  }, []);

  // 检查本轮是否完成（所有5个单词都学过）
  const isRoundComplete = useMemo(() => {
    return learnedWordsInRound.size >= currentRoundWords.length;
  }, [learnedWordsInRound.size, currentRoundWords.length]);

  // 获取下一个要学习的单词
  const getNextWordToLearn = useCallback(
    (allWords: DailyPlanWordDto[]) => {
      // 如果本轮还没学完，继续学习本轮单词
      if (!isRoundComplete) {
        const unlearnedWord = currentRoundWords.find(
          (word) => !learnedWordsInRound.has(word.id),
        );
        if (unlearnedWord) {
          return unlearnedWord;
        }
      }

      // 本轮学完，开始下一轮或进入测验
      const nextRoundStartIndex = (roundIndex + 1) * WORDS_PER_ROUND;
      if (nextRoundStartIndex < allWords.length) {
        startNewRound(allWords, nextRoundStartIndex);
        return allWords[nextRoundStartIndex];
      }

      return null; // 所有单词学完
    },
    [
      isRoundComplete,
      currentRoundWords,
      learnedWordsInRound,
      roundIndex,
      startNewRound,
    ],
  );

  // 重置轮次
  const resetRound = useCallback(() => {
    setLearnedWordsInRound(new Set());
    setRoundIndex(0);
    setCurrentRoundWords([]);
  }, []);

  return {
    learnedWordsInRound,
    roundIndex,
    currentRoundWords,
    isRoundComplete,
    startNewRound,
    markWordAsLearned,
    getNextWordToLearn,
    resetRound,
    WORDS_PER_ROUND,
  };
};
