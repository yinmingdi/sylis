import type {
  AddBookReqDto,
  BookDetailResDto,
  GetBooksResDto,
  GetCurrentBookResDto,
  GetDailyPlanReqDto,
  GetDailyPlanResDto,
  GetNewWordsReqDto,
  GetNewWordsResDto,
  GetReviewWordsReqDto,
  GetReviewWordsResDto,
} from '@/legacy-dto';

import {
  enrollLegacyBook,
  fetchLegacyBookDetail,
  fetchLegacyBooks,
  fetchLegacyCurrentBook,
} from './modern-book-adapter';
import { fetchLegacyDailyPlan } from '../../learning/api/modern-study-adapter';

const response = <T>(data: T) => ({ data, message: 'ok', code: 0 });

export const getBooks = async () =>
  response<GetBooksResDto[]>(await fetchLegacyBooks());

export const addLearningBook = async (params: AddBookReqDto) => {
  await enrollLegacyBook(params);
  return response<null>(null);
};

export const getCurrentBook = async () =>
  response<GetCurrentBookResDto>(await fetchLegacyCurrentBook());

export const getDailyPlan = async (data: GetDailyPlanReqDto) =>
  response<GetDailyPlanResDto>(await fetchLegacyDailyPlan(data.bookId));

export const getBookDetail = async (bookId: string) =>
  response<BookDetailResDto>(await fetchLegacyBookDetail(bookId));

export const getNewWords = async (data: GetNewWordsReqDto) => {
  const plan = await fetchLegacyDailyPlan(data.bookId);
  return response<GetNewWordsResDto>({
    words: plan.newWords,
    plannedCount: plan.plannedNewCount,
    completedCount: plan.completedNewCount,
    date: plan.date,
  });
};

export const getReviewWords = async (data: GetReviewWordsReqDto) => {
  const plan = await fetchLegacyDailyPlan(data.bookId);
  return response<GetReviewWordsResDto>({
    words: plan.reviewWords,
    plannedCount: plan.plannedReviewCount,
    completedCount: plan.completedReviewCount,
    date: plan.date,
  });
};
