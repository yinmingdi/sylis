// Auto-generated from Prisma schema

export interface UserBook {
  id: string;
  userLearningId: string;
  bookId: string;
  dailyNewWords: number;
  dailyReviewWords: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum WordLearningStatus {
  NEW = 'NEW',
  LEARNING = 'LEARNING',
  REVIEW = 'REVIEW',
  MASTERED = 'MASTERED',
  SUSPENDED = 'SUSPENDED',
}

export enum FirstRoundChoice {
  NOT_STARTED = 'NOT_STARTED',
  RECOGNIZED = 'RECOGNIZED',
  NOT_RECOGNIZED = 'NOT_RECOGNIZED',
}
