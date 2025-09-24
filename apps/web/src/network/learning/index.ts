import { request } from '../request';

// 学习统计数据接口
export interface LearningStats {
  checkInDays: number; // 打卡天数
  learningProgress: number; // 学习进度百分比
  newWordsLearned: number; // 新学词数
  reviewWords: number; // 复习词数
}

// 当前书籍信息接口
export interface CurrentBook {
  id: string;
  name: string;
  coverUrl: string;
  wordNum: number;
}

export interface CurrentBookResponse {
  daysLeft: number;
  book: CurrentBook | null;
  progress: number;
  newWords: number;
  totalWords: number;
}

// 单词学习状态枚举
export enum WordLearningStatus {
  NEW = 'NEW',
  LEARNING = 'LEARNING',
  REVIEW = 'REVIEW',
  MASTERED = 'MASTERED',
}

// 单词含义接口
export interface WordMeaning {
  id: string;
  partOfSpeech: string;
  meaningCn: string;
  meaningEn?: string;
}

// 例句接口
export interface ExampleSentence {
  id: string;
  sentenceEn: string;
  sentenceCn: string;
}

// 选择题选项接口
export interface QuizChoiceOption {
  id?: string;
  wordId: string;
  text: string;
}

// 选择题数据接口
export interface QuizChoiceData {
  id: string;
  questionId: string;
  wordId: string;
  answerWordId: string;
  options: QuizChoiceOption[];
}

// 每日计划单词接口
export interface DailyPlanWord {
  id: string;
  headword: string;
  ukPhonetic?: string;
  usPhonetic?: string;
  ukAudio?: string;
  usAudio?: string;
  star: number;
  status: WordLearningStatus;
  nextReviewAt?: Date;
  easeFactor: number;
  repetition: number;
  meanings: WordMeaning[];
  exampleSentences: ExampleSentence[];
  quizChoice: QuizChoiceData;
}

// 获取每日学习计划请求
export interface GetDailyPlanRequest {
  bookId?: string;
  date?: string;
  regenerate?: boolean;
}

// 获取每日学习计划响应
export interface GetDailyPlanResponse {
  newWords: DailyPlanWord[];
  reviewWords: DailyPlanWord[];
  plannedNewCount: number;
  plannedReviewCount: number;
  completedNewCount: number;
  completedReviewCount: number;
  date: string;
}

// 更新单词状态请求
export interface UpdateWordStatusRequest {
  wordId: string;
  status: WordLearningStatus;
  isCorrect?: boolean;
  difficultyRating?: number;
}

// 批量更新单词状态请求
export interface BatchUpdateWordsRequest {
  words: UpdateWordStatusRequest[];
}

// 获取学习统计数据
export const getLearningStats = () => {
  return request<never, LearningStats>({
    url: '/learning/stats',
    method: 'GET',
  });
};

// 获取当前学习书籍信息
export const getCurrentBook = () => {
  return request<never, CurrentBookResponse>({
    url: '/learning/current-book',
    method: 'GET',
  });
};

// 获取今日学习进度
export const getTodayProgress = () => {
  return request<never, { completed: number; total: number }>({
    url: '/learning/today-progress',
    method: 'GET',
  });
};

// 获取每日学习计划
export const getDailyPlan = (params: GetDailyPlanRequest) => {
  return request<GetDailyPlanRequest, GetDailyPlanResponse>({
    url: '/learning/daily-plan',
    method: 'GET',
    data: params,
  });
};

// 更新单词学习状态
export const updateWordStatus = (data: UpdateWordStatusRequest) => {
  return request<UpdateWordStatusRequest, void>({
    url: '/learning/word-status',
    method: 'PATCH',
    data,
  });
};

// 批量更新单词学习状态
export const batchUpdateWordStatus = (data: BatchUpdateWordsRequest) => {
  return request<BatchUpdateWordsRequest, void>({
    url: '/learning/batch-word-status',
    method: 'PATCH',
    data,
  });
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
