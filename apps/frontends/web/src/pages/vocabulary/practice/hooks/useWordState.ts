import { useState, useCallback } from 'react';

import type { GetDailyPlanResDto } from '@/legacy-dto';

import { LearningStage } from '../context/VocabularyPracticeContext';

/**
 * Hook: 管理单词学习的基础状态
 */
export const useWordState = () => {
  const [dailyPlan, setDailyPlan] = useState<GetDailyPlanResDto | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [learningStage, setLearningStage] = useState<LearningStage>(
    LearningStage.RECITE,
  );
  const [previousStage, setPreviousStage] = useState<LearningStage | null>(
    null,
  ); // ⭐️ 记录进入详情页之前的阶段
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI 状态
  const [isFavorited, setIsFavorited] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentVoice, setCurrentVoice] = useState<'us' | 'uk'>('us');

  // 获取所有单词
  const allWords = dailyPlan
    ? [...dailyPlan.newWords, ...dailyPlan.reviewWords]
    : [];
  const currentWord = allWords[currentWordIndex] || null;

  // 导航方法
  const goToNextWord = useCallback(() => {
    if (currentWordIndex < allWords.length - 1) {
      setCurrentWordIndex((prev) => prev + 1);
      setShowHint(false);
      setLearningStage(LearningStage.RECITE);
    } else {
      setLearningStage(LearningStage.COMPLETE);
    }
  }, [currentWordIndex, allWords.length]);

  const goToPreviousWord = useCallback(() => {
    if (currentWordIndex > 0) {
      setCurrentWordIndex((prev) => prev - 1);
      setShowHint(false);
    }
  }, [currentWordIndex]);

  const goToWordDetail = useCallback((fromStage?: LearningStage) => {
    if (fromStage) {
      setPreviousStage(fromStage); // ⭐️ 记录从哪个阶段进入详情页
    }
    setLearningStage(LearningStage.DETAIL);
  }, []);

  return {
    // 状态
    dailyPlan,
    setDailyPlan,
    currentWordIndex,
    setCurrentWordIndex,
    learningStage,
    setLearningStage,
    previousStage,
    setPreviousStage,
    loading,
    setLoading,
    error,
    setError,
    isFavorited,
    setIsFavorited,
    showHint,
    setShowHint,
    currentVoice,
    setCurrentVoice,

    // 计算值
    allWords,
    currentWord,

    // 方法
    goToNextWord,
    goToPreviousWord,
    goToWordDetail,
  };
};
