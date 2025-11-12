import type {
  DailyPlanWordDto,
  GetDailyPlanResDto,
} from '@sylis/shared/dto';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';


// 学习阶段枚举
export enum LearningStage {
  RECITE = 'recite', // 背诵阶段（第一轮识别）
  QUIZ = 'quiz', // 测验阶段（选择题）
  DETAIL = 'detail', // 详情阶段
  COMPLETE = 'complete', // 完成阶段
}

// 测验题型
export type QuizType = 'recall' | 'choice';

// Context 状态接口
export interface VocabularyPracticeState {
  // 数据状态
  dailyPlan: GetDailyPlanResDto | null;
  currentWord: DailyPlanWordDto | null;
  currentWordIndex: number;
  learningStage: LearningStage;

  // UI 状态
  isFavorited: boolean;
  showHint: boolean;
  currentVoice: 'us' | 'uk';
  loading: boolean;
  error: string | null;

  // 学习进度
  learnedWordsInRound: Set<string>; // 本轮已学过的单词ID
  currentRoundWords: DailyPlanWordDto[]; // 当前轮的单词（5个）
  roundIndex: number; // 当前轮次索引

  // 测验题型跟踪：记录每个单词使用的题型，确保每个单词只出现一次
  wordQuizTypes: Map<string, QuizType>; // wordId -> quizType
}

// Context Actions 接口
export interface VocabularyPracticeActions {
  // 导航操作
  goToNextWord: () => void;
  goToPreviousWord: () => void;
  goToWordDetail: () => void;

  // 学习操作
  handleRecognizeWord: (recognized: boolean) => Promise<void>; // 第一轮：认识/不认识
  handleQuizAnswer: (isCorrect: boolean) => Promise<void>; // 测验：答对/答错
  handleMarkComplete: () => Promise<void>; // 标记完成

  // UI 操作
  toggleFavorite: () => void;
  toggleHint: () => void;
  toggleVoice: () => void;
  playPronunciation: (voice?: 'us' | 'uk') => void;

  // 流程控制
  startNewRound: () => void; // 开始新一轮
  backToWordList: () => void;
  retryLoading: () => Promise<void>;
}

// 进度信息接口
export interface VocabularyProgress {
  completed: number;
  total: number;
  currentRound: number;
  totalRounds: number;
}

// Context 完整类型
export interface VocabularyPracticeContextType {
  state: VocabularyPracticeState;
  actions: VocabularyPracticeActions;
  progress: VocabularyProgress;
  hasPreviousWord: boolean;
  hasNextWord: boolean;
}

// 创建 Context
export const VocabularyPracticeContext = createContext<
  VocabularyPracticeContextType | undefined
>(undefined);

// Hook: 使用 Context
export const useVocabularyPracticeContext = () => {
  const context = useContext(VocabularyPracticeContext);
  if (!context) {
    throw new Error(
      'useVocabularyPracticeContext must be used within VocabularyPracticeProvider',
    );
  }
  return context;
};

// Provider Props
export interface VocabularyPracticeProviderProps {
  children: ReactNode;
  bookId: string;
  date?: string;
  type?: 'new' | 'review'; // 学习类型：新单词或复习单词
}

