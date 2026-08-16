// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface GetTestHistoryReqDto {
  page?: number;
  limit?: number;
}

export interface TestHistoryItemDto {
  id: string;
  score: number;
  correctCount: number;
  totalCount: number;
  level: string;
  estimatedVocabulary: number;
  timeSpent: number;
  completedAt: Date;
}

export interface GetTestHistoryResDto {
  tests: TestHistoryItemDto[];
  total: number;
  page: number;
  limit: number;
}
