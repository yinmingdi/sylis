import { CollectionSource } from '@sylis/shared/dto';
import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { VocabularyPracticeProviderProps } from './VocabularyPracticeContext';

import {
  VocabularyPracticeContext,
  LearningStage,
  type QuizType,
} from './VocabularyPracticeContext';
import { useWordCollection } from '../../../../hooks/useWordCollection';
import { useAudio } from '../hooks/useAudio';
import { useDataLoader } from '../hooks/useDataLoader';
import { useRoundManager } from '../hooks/useRoundManager';
import { useWordActions } from '../hooks/useWordActions';
import { useWordProgress } from '../hooks/useWordProgress';
import { useWordState } from '../hooks/useWordState';

// 工具函数：随机打乱数组
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * 为单词列表分配题型
 * 确保每个单词在整个测验过程中只出现一次
 * 随机分配 recall 或 choice，但保证每个单词只分配一次
 */
const assignQuizTypes = (
  words: any[],
  existingTypes: Map<string, QuizType>,
): Map<string, QuizType> => {
  const newTypes = new Map(existingTypes);

  // 为还没有分配题型的单词随机分配
  words.forEach((word) => {
    if (!newTypes.has(word.id)) {
      // 随机选择题型
      const quizType: QuizType = Math.random() < 0.3 ? 'recall' : 'choice';
      newTypes.set(word.id, quizType);
    }
  });

  return newTypes;
};

export const VocabularyPracticeProvider: React.FC<
  VocabularyPracticeProviderProps
> = ({ children, bookId, date, type }) => {
  const navigate = useNavigate();

  // ⭐️ 题型跟踪：记录每个单词使用的题型
  const [wordQuizTypes, setWordQuizTypes] = useState<Map<string, QuizType>>(
    new Map(),
  );

  // 组合各个 hooks
  const wordState = useWordState();
  const roundManager = useRoundManager();
  const wordActions = useWordActions();
  const audio = useAudio();
  const dataLoader = useDataLoader();
  const wordProgress = useWordProgress(
    wordState.allWords,
    roundManager.learnedWordsInRound,
  );

  // ⭐️ 收藏功能
  const wordCollection = useWordCollection({
    onSuccess: (_wordId, isCollected) => {
      // 更新当前单词的收藏状态
      wordState.setIsFavorited(isCollected);
    },
  });

  const {
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
    allWords,
    goToNextWord,
    goToPreviousWord,
    goToWordDetail,
  } = wordState;

  // ⭐️ 当前显示的单词：优先使用 currentRoundWords（复习阶段），否则使用 allWords
  const activeWordList =
    roundManager.currentRoundWords.length > 0
      ? roundManager.currentRoundWords
      : allWords;
  const currentWord = activeWordList[currentWordIndex] || null;

  // ⭐️ 修复的下一个单词方法：使用 activeWordList
  const goToNextWordFixed = useCallback(() => {
    if (currentWordIndex < activeWordList.length - 1) {
      setCurrentWordIndex((prev) => prev + 1);
      setShowHint(false);
    }
  }, [currentWordIndex, activeWordList.length, setCurrentWordIndex, setShowHint]);

  // 加载每日计划
  const retryLoading = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const plan = await dataLoader.loadDailyPlan(bookId, date, undefined, type);
      setDailyPlan(plan);

      // ⭐️ 初始化收藏状态
      const collectedWordIds = plan.allWords
        .filter((w) => w.isCollected)
        .map((w) => w.id);
      wordCollection.setCollected(collectedWordIds);

      // ⭐️ 初始化学习流程
      if (plan.allWords.length > 0) {
        const notStartedWords = plan.allWords.filter(
          (w) => w.dailyProgress?.firstRoundChoice === 'NOT_STARTED',
        );

        if (notStartedWords.length > 0) {
          // 有未识别的单词，从 RECITE 开始
          roundManager.startNewRound(notStartedWords, 0);
          setLearningStage(LearningStage.RECITE);
        } else {
          // 所有单词都识别过了，直接进入复习（QUIZ）
          const unfinishedWords = plan.allWords.filter(
            (w) => !w.dailyProgress?.isCompletedToday,
          );
          if (unfinishedWords.length > 0) {
            // 随机抽取最多5个
            const reviewWords = shuffleArray(unfinishedWords).slice(0, 5);
            // ⭐️ 为这些单词分配题型
            setWordQuizTypes((prev) => assignQuizTypes(reviewWords, prev));
            roundManager.startNewRound(reviewWords, 0);
            setLearningStage(LearningStage.QUIZ);
          } else {
            setLearningStage(LearningStage.COMPLETE);
          }
        }
      } else {
        setLearningStage(LearningStage.COMPLETE);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, date, type]); // ⭐️ 只依赖稳定的值

  // 初始化加载
  useEffect(() => {
    retryLoading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, date, type]); // ⭐️ 只在 bookId、date 或 type 变化时重新加载

  // ⭐️ 同步当前单词的收藏状态
  useEffect(() => {
    if (currentWord) {
      const isCollected = wordCollection.isCollected(currentWord.id);
      setIsFavorited(isCollected);
    }
  }, [currentWord, wordCollection, setIsFavorited]);

  // ==================== Helper Functions ====================

  /**
   * 开始下一轮复习（从当前学习列表的未完成单词中随机抽取）
   */
  const startNextReviewRound = useCallback(async () => {
    // ⭐️ 从 allWords（当前学习列表）中获取未完成的单词
    const unfinishedWords = allWords.filter(
      (w) => !w.dailyProgress?.isCompletedToday,
    );

    if (unfinishedWords.length === 0) {
      setLearningStage(LearningStage.COMPLETE);
      return;
    }

    const notStartedWords = unfinishedWords.filter(
      (w) => w.dailyProgress?.firstRoundChoice === 'NOT_STARTED',
    );

    if (notStartedWords.length > 0) {
      roundManager.resetRound();
      roundManager.startNewRound(notStartedWords, 0);
      setCurrentWordIndex(0);
      setLearningStage(LearningStage.RECITE);
    } else {
      const reviewWords = shuffleArray(unfinishedWords).slice(
        0,
        Math.min(roundManager.WORDS_PER_ROUND, unfinishedWords.length),
      );

      // ⭐️ 为这些单词分配题型
      setWordQuizTypes((prev) => assignQuizTypes(reviewWords, prev));
      roundManager.resetRound();
      roundManager.startNewRound(reviewWords, 0);
      setCurrentWordIndex(0);
      setLearningStage(LearningStage.QUIZ);
    }
  }, [
    allWords,
    roundManager,
    setCurrentWordIndex,
    setLearningStage,
  ]);

  // ==================== Actions ====================

  /**
   * 处理第一轮识别
   */
  const handleRecognizeWord = useCallback(
    async (recognized: boolean) => {
      if (!currentWord) return;

      try {
        const firstRoundChoice = await wordActions.handleRecognizeWord(
          currentWord,
          recognized,
        );

        // 更新本地状态
        // 点击"认识"时，correctCount = 1，但必须通过测验达到 requiredCorrectCount 才能完成
        // 点击"不认识"时，correctCount = 0，需要答对3次才能完成
        const correctCount = recognized ? 1 : 0;
        const requiredCorrectCount = recognized ? 1 : 3;
        // 即使点击"认识"也不能直接完成，必须通过测验达到 requiredCorrectCount
        const isCompletedToday = false;

        currentWord.dailyProgress = {
          firstRoundChoice,
          correctCount,
          requiredCorrectCount,
          isCompletedToday,
        };

        // 更新 dailyPlan 以确保状态同步
        if (dailyPlan) {
          const updateWordProgress = (word: any) =>
            word.id === currentWord.id
              ? {
                ...word,
                dailyProgress: {
                  firstRoundChoice,
                  correctCount,
                  requiredCorrectCount,
                  isCompletedToday,
                },
              }
              : word;

          setDailyPlan({
            ...dailyPlan,
            newWords: dailyPlan.newWords.map(updateWordProgress),
            reviewWords: dailyPlan.reviewWords.map(updateWordProgress),
          });
        }

        // 标记本轮已学习
        roundManager.markWordAsLearned(currentWord.id);

        // ⭐️ 进入详情页，记录从 RECITE 来
        goToWordDetail(LearningStage.RECITE);
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作失败');
      }
    },
    [currentWord, wordActions, roundManager, goToWordDetail, setError, dailyPlan, setDailyPlan],
  );

  /**
   * 处理测验答题
   */
  const handleQuizAnswer = useCallback(
    async (isCorrect: boolean) => {
      if (!currentWord) return;

      try {
        const isCompleted = await wordActions.handleQuizAnswer(
          currentWord,
          isCorrect,
        );

        // 更新本地进度
        if (currentWord.dailyProgress) {
          // 答错时清空 correctCount，答对时增加
          const newCorrectCount = isCorrect
            ? currentWord.dailyProgress.correctCount + 1
            : 0;

          // 答错时肯定不能算完成
          const isReallyCompleted = isCorrect && isCompleted;

          currentWord.dailyProgress = {
            ...currentWord.dailyProgress,
            correctCount: newCorrectCount,
            isCompletedToday: isReallyCompleted,
          };

          // 更新 dailyPlan 以确保状态同步
          if (dailyPlan) {
            const updateWordProgress = (word: any) =>
              word.id === currentWord.id
                ? {
                  ...word,
                  dailyProgress: {
                    ...word.dailyProgress,
                    correctCount: newCorrectCount,
                    isCompletedToday: isReallyCompleted,
                  },
                }
                : word;

            setDailyPlan({
              ...dailyPlan,
              newWords: dailyPlan.newWords.map(updateWordProgress),
              reviewWords: dailyPlan.reviewWords.map(updateWordProgress),
            });
          }
        }

        goToWordDetail(LearningStage.QUIZ);
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作失败');
      }
    },
    [currentWord, wordActions, goToWordDetail, setError, dailyPlan, setDailyPlan],
  );

  /**
   * 从详情页继续（判断下一步去哪里）
   * 注意：这里只是继续学习流程，不会标记为完成
   * 完成状态应该由 handleRecognizeWord 和 handleQuizAnswer 根据学习次数来判断
   */
  const handleMarkComplete = useCallback(async () => {
    if (!currentWord) return;

    try {
      const currentRoundStartIndex =
        roundManager.roundIndex * roundManager.WORDS_PER_ROUND;
      const currentRoundEndIndex = Math.min(
        currentRoundStartIndex + roundManager.WORDS_PER_ROUND,
        activeWordList.length,
      );

      if (previousStage === LearningStage.RECITE) {
        roundManager.markWordAsLearned(currentWord.id);
        const learnedCount = roundManager.learnedWordsInRound.size;

        const shouldEnterQuiz =
          (learnedCount > 0 &&
            learnedCount % roundManager.WORDS_PER_ROUND === 0) ||
          currentWordIndex >= activeWordList.length - 1;

        if (shouldEnterQuiz) {
          setLearningStage(LearningStage.QUIZ);
          setPreviousStage(null);
          setCurrentWordIndex(currentRoundStartIndex);
        } else {
          setLearningStage(LearningStage.RECITE);
          setPreviousStage(null);
          goToNextWordFixed();
        }
      } else if (previousStage === LearningStage.QUIZ) {
        // 检查单词是否真的完成了学习次数
        const progress = currentWord.dailyProgress;
        const isReallyCompleted = progress
          ? progress.correctCount >= progress.requiredCorrectCount
          : false;

        // 如果完成了，更新本地状态（后端已经更新了）
        if (isReallyCompleted && dailyPlan) {
          const updateWordProgress = (word: any) =>
            word.id === currentWord.id
              ? {
                ...word,
                dailyProgress: {
                  ...word.dailyProgress,
                  isCompletedToday: true,
                },
              }
              : word;

          setDailyPlan({
            ...dailyPlan,
            newWords: dailyPlan.newWords.map(updateWordProgress),
            reviewWords: dailyPlan.reviewWords.map(updateWordProgress),
          });
        }

        if (currentWordIndex >= currentRoundEndIndex - 1) {
          setPreviousStage(null);
          await startNextReviewRound();
        } else {
          setLearningStage(LearningStage.QUIZ);
          setPreviousStage(null);
          goToNextWordFixed();
        }
      } else {
        setLearningStage(LearningStage.RECITE);
        setPreviousStage(null);
        goToNextWordFixed();
      }
    } catch (error) {
      console.error('继续学习失败:', error);
    }
  }, [
    currentWord,
    currentWordIndex,
    previousStage,
    activeWordList.length,
    dailyPlan,
    roundManager,
    setDailyPlan,
    setLearningStage,
    setPreviousStage,
    setCurrentWordIndex,
    goToNextWordFixed,
    startNextReviewRound,
  ]);

  // ==================== UI Actions ====================

  // ⭐️ 切换收藏状态（使用真实API）
  const toggleFavorite = useCallback(async () => {
    if (!currentWord) return;

    const currentIsCollected = wordCollection.isCollected(currentWord.id);
    await wordCollection.toggleCollection(
      currentWord.id,
      currentIsCollected,
      CollectionSource.QUIZ,
    );
  }, [currentWord, wordCollection]);

  const toggleHint = useCallback(() => {
    setShowHint((prev) => !prev);
  }, [setShowHint]);

  const playPronunciation = useCallback(
    (voice?: 'us' | 'uk') => {
      audio.playPronunciation(currentWord, voice);
    },
    [audio, currentWord],
  );

  const backToWordList = useCallback(() => {
    navigate('/vocabulary-learning');
  }, [navigate]);

  // ==================== Progress ====================

  const progress = useMemo(() => {
    return {
      completed: wordProgress.completedCount,
      total: allWords.length,
      currentRound: roundManager.roundIndex + 1,
      totalRounds: Math.ceil(allWords.length / roundManager.WORDS_PER_ROUND),
    };
  }, [
    wordProgress.completedCount,
    allWords.length,
    roundManager.roundIndex,
    roundManager.WORDS_PER_ROUND,
  ]);

  // ==================== Context Value ====================

  const contextValue = useMemo(
    () => ({
      state: {
        dailyPlan,
        currentWord,
        currentWordIndex,
        learningStage,
        isFavorited,
        showHint,
        currentVoice: audio.currentVoice,
        loading,
        error,
        learnedWordsInRound: roundManager.learnedWordsInRound,
        currentRoundWords: roundManager.currentRoundWords,
        roundIndex: roundManager.roundIndex,
        wordQuizTypes, // ⭐️ 添加题型跟踪
      },
      actions: {
        goToNextWord,
        goToPreviousWord,
        goToWordDetail,
        handleRecognizeWord,
        handleQuizAnswer,
        handleMarkComplete,
        toggleFavorite,
        toggleHint,
        toggleVoice: audio.toggleVoice,
        playPronunciation,
        startNewRound: () =>
          roundManager.startNewRound(allWords, roundManager.roundIndex + 1),
        backToWordList,
        retryLoading,
      },
      progress,
      hasPreviousWord: currentWordIndex > 0,
      hasNextWord: currentWordIndex < allWords.length - 1,
    }),
    [
      dailyPlan,
      currentWord,
      currentWordIndex,
      learningStage,
      isFavorited,
      showHint,
      audio.currentVoice,
      loading,
      error,
      roundManager,
      allWords,
      goToNextWord,
      goToPreviousWord,
      goToWordDetail,
      handleRecognizeWord,
      handleQuizAnswer,
      handleMarkComplete,
      toggleFavorite,
      toggleHint,
      audio.toggleVoice,
      playPronunciation,
      backToWordList,
      retryLoading,
      progress,
      wordQuizTypes, // ⭐️ 添加依赖
    ],
  );

  return (
    <VocabularyPracticeContext.Provider value={contextValue}>
      {children}
    </VocabularyPracticeContext.Provider>
  );
};
