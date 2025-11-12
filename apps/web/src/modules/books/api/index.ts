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
} from '@sylis/shared/dto';

import request from '../../../network/request';

export const getBooks = () => {
  return request<null, GetBooksResDto[]>({
    method: 'GET',
    url: '/books',
  });
};

export const addLearningBook = (params: AddBookReqDto) => {
  return request<AddBookReqDto, null>({
    method: 'POST',
    url: `/learning/add-book`,
    data: params,
  });
};

export const getCurrentBook = () => {
  return request<null, GetCurrentBookResDto>({
    method: 'GET',
    url: `/learning/current-book`,
  });
};

export const getDailyPlan = (data: GetDailyPlanReqDto) => {
  return request<GetDailyPlanReqDto, GetDailyPlanResDto>({
    method: 'GET',
    url: '/learning/daily-plan',
    data,
    timeout: 100000,
  });
};

export const getBookDetail = (bookId: string) => {
  return request<null, BookDetailResDto>({
    method: 'GET',
    url: `/learning/book-detail/${bookId}`,
  });
};

export const getNewWords = (data: GetNewWordsReqDto) => {
  return request<GetNewWordsReqDto, GetNewWordsResDto>({
    method: 'GET',
    url: '/learning/new-words',
    data,
    timeout: 100000,
  });
};

export const getReviewWords = (data: GetReviewWordsReqDto) => {
  return request<GetReviewWordsReqDto, GetReviewWordsResDto>({
    method: 'GET',
    url: '/learning/review-words',
    data,
    timeout: 100000,
  });
};
