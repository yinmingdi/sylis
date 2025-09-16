import type { AddBookReqDto, GetBooksResDto, GetCurrentBookResDto } from '@sylis/shared/dto';

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
