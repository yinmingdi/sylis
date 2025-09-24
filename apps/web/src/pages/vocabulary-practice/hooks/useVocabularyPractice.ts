import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  getDailyPlan,
  updateWordStatus,
  type GetDailyPlanResponse,
  type DailyPlanWord,
  WordLearningStatus,
} from '../../../network/learning';

// 学习阶段枚举
export enum LearningStage {
  RECITE = 'recite', // 背诵阶段
  DETAIL = 'detail', // 详情阶段
  COMPLETE = 'complete', // 完成阶段
}

export interface UseVocabularyPracticeOptions {
  bookId: string;
  date?: string;
}

export interface UseVocabularyPracticeReturn {
  // 数据状态
  dailyPlan: GetDailyPlanResponse | null;
  currentWord: DailyPlanWord | null;
  learningStage: LearningStage;
  isFavorited: boolean;
  showHint: boolean;
  currentVoice: 'us' | 'uk';
  loading: boolean;
  error: string | null;

  // 进度信息
  progress: {
    completed: number;
    total: number;
    newWordsCompleted: number;
    reviewWordsCompleted: number;
    plannedNewCount: number;
    plannedReviewCount: number;
  };

  // 操作方法
  handlePreviousWord: () => void;
  handleNextWord: () => void;
  handleToggleFavorite: () => void;
  handleMarkAsFamiliar: () => Promise<void>;
  handleKnowWord: (known: boolean) => Promise<void>;
  handleNextWordFromDetail: () => Promise<void>;
  handleToggleHint: () => void;
  handleVoiceToggle: () => void;
  playWordPronunciation: (voice?: 'us' | 'uk') => void;
  handleBackToWords: () => void;

  // 状态检查
  hasPreviousWord: boolean;
  hasNextWord: boolean;
}

export const useVocabularyPractice = (
  options: UseVocabularyPracticeOptions,
): UseVocabularyPracticeReturn => {
  const navigate = useNavigate();

  // 状态管理
  const [dailyPlan, setDailyPlan] = useState<GetDailyPlanResponse | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [learningStage, setLearningStage] = useState<LearningStage>(
    LearningStage.RECITE,
  );
  const [isFavorited, setIsFavorited] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentVoice, setCurrentVoice] = useState<'us' | 'uk'>('us');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取所有待学习单词
  const allWords = dailyPlan
    ? [...dailyPlan.newWords, ...dailyPlan.reviewWords]
    : [];
  const currentWord = allWords[currentWordIndex] || null;

  // 进度信息
  const progress = {
    completed: dailyPlan?.completedNewCount || 0, // 只计算新单词完成数
    total: dailyPlan?.plannedNewCount || 0, // 使用plannedNewCount作为总数
    newWordsCompleted: dailyPlan?.completedNewCount || 0,
    reviewWordsCompleted: dailyPlan?.completedReviewCount || 0,
    plannedNewCount: dailyPlan?.plannedNewCount || 0,
    plannedReviewCount: dailyPlan?.plannedReviewCount || 0,
  };

  // 加载每日学习计划
  const loadDailyPlan = useCallback(async () => {
    // 检查 bookId 是否有效
    if (!options.bookId || options.bookId.trim() === '') {
      setError('请先选择学习书籍');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('Loading daily plan with bookId:', options.bookId);
      const response = await getDailyPlan({
        bookId: options.bookId,
      });
      console.log('Daily plan response:', response);
      setDailyPlan(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载学习计划失败');
      console.error('加载每日学习计划失败:', err);
    } finally {
      setLoading(false);
    }
  }, [options.bookId]);

  // 初始化加载
  useEffect(() => {
    loadDailyPlan();
  }, [loadDailyPlan]);

  // 重置当前单词状态
  useEffect(() => {
    if (currentWord) {
      setLearningStage(LearningStage.RECITE);
      setIsFavorited(false);
      setShowHint(false);
    }
  }, [currentWord]);

  // 播放单词发音
  const playWordPronunciation = useCallback(
    (voice: 'us' | 'uk' = currentVoice) => {
      if (!currentWord) return;

      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(currentWord.headword);
        utterance.lang = voice === 'us' ? 'en-US' : 'en-GB';
        utterance.rate = 0.8;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      }
    },
    [currentWord, currentVoice],
  );

  // 切换语音类型并发音
  const handleVoiceToggle = useCallback(() => {
    const newVoice = currentVoice === 'us' ? 'uk' : 'us';
    setCurrentVoice(newVoice);
    playWordPronunciation(newVoice);
  }, [currentVoice, playWordPronunciation]);

  // 返回上一个单词
  const handlePreviousWord = useCallback(() => {
    if (currentWordIndex > 0) {
      setCurrentWordIndex(currentWordIndex - 1);
    }
  }, [currentWordIndex]);

  // 进入下一个单词
  const handleNextWord = useCallback(() => {
    if (currentWordIndex < allWords.length - 1) {
      setCurrentWordIndex(currentWordIndex + 1);
    }
  }, [currentWordIndex, allWords.length]);

  // 切换收藏状态
  const handleToggleFavorite = useCallback(() => {
    setIsFavorited(!isFavorited);
    // TODO: 调用API保存收藏状态
  }, [isFavorited]);

  // 标记为熟悉
  const handleMarkAsFamiliar = useCallback(async () => {
    if (!currentWord) return;

    try {
      await updateWordStatus({
        wordId: currentWord.id,
        status: WordLearningStatus.MASTERED,
        isCorrect: true,
      });

      // 更新本地状态
      if (dailyPlan) {
        setDailyPlan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            completedNewCount: prev.completedNewCount + 1,
          };
        });
      }

      // 延迟后自动跳转到下一个单词
      setTimeout(() => {
        if (currentWordIndex < allWords.length - 1) {
          setCurrentWordIndex(currentWordIndex + 1);
        } else {
          // 所有单词学习完成
          setLearningStage(LearningStage.COMPLETE);
        }
      }, 1000);
    } catch (err) {
      console.error('标记单词为熟悉失败:', err);
      setError('操作失败，请重试');
    }
  }, [currentWord, dailyPlan, currentWordIndex, allWords.length]);

  // 处理认识/不认识选择
  const handleKnowWord = useCallback(
    async (known: boolean) => {
      if (!currentWord) return;

      try {
        const status = known
          ? WordLearningStatus.LEARNING
          : WordLearningStatus.REVIEW;
        await updateWordStatus({
          wordId: currentWord.id,
          status,
          isCorrect: known,
        });

        // 无论认识还是不认识，都进入详情页
        setLearningStage(LearningStage.DETAIL);

        // 如果不认识，标记为需要复习
        if (!known) {
          console.log('标记为需要复习');
        }
      } catch (err) {
        console.error('更新单词状态失败:', err);
        setError('操作失败，请重试');
      }
    },
    [currentWord],
  );

  // 在详情页进入下一个单词
  const handleNextWordFromDetail = useCallback(async () => {
    if (!currentWord) return;

    try {
      // 更新单词状态为已学习
      await updateWordStatus({
        wordId: currentWord.id,
        status: WordLearningStatus.LEARNING,
        isCorrect: true,
      });

      // 更新本地进度
      if (dailyPlan) {
        setDailyPlan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            completedNewCount: prev.completedNewCount + 1,
          };
        });
      }

      // 检查是否是最后一个单词
      if (currentWordIndex >= allWords.length - 1) {
        // 所有单词学习完成，进入完成页面
        setLearningStage(LearningStage.COMPLETE);
      } else {
        // 进入下一个单词
        setCurrentWordIndex(currentWordIndex + 1);
      }
    } catch (err) {
      console.error('进入下一个单词失败:', err);
      setError('操作失败，请重试');
    }
  }, [currentWord, dailyPlan, currentWordIndex, allWords.length]);

  // 点击提示显示/隐藏中文
  const handleToggleHint = useCallback(() => {
    setShowHint(!showHint);
  }, [showHint]);

  // 完成学习，回到words页面
  const handleBackToWords = useCallback(() => {
    navigate('/vocabulary-learning');
  }, [navigate]);

  // 状态检查
  const hasPreviousWord = currentWordIndex > 0;
  const hasNextWord = currentWordIndex < allWords.length - 1;

  return {
    // 数据状态
    dailyPlan,
    currentWord,
    learningStage,
    isFavorited,
    showHint,
    currentVoice,
    loading,
    error,

    // 进度信息
    progress,

    // 操作方法
    handlePreviousWord,
    handleNextWord,
    handleToggleFavorite,
    handleMarkAsFamiliar,
    handleKnowWord,
    handleNextWordFromDetail,
    handleToggleHint,
    handleVoiceToggle,
    playWordPronunciation,
    handleBackToWords,

    // 状态检查
    hasPreviousWord,
    hasNextWord,
  };
};
