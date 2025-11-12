import type {
  CreateArticleReqDto,
  CreateArticleResDto,
  GetArticlesReqDto,
  GetArticlesResDto,
} from '@sylis/shared/dto';

import request from '../../../network/request';

/**
 * 创建文章
 */
export const createArticle = (params: CreateArticleReqDto) => {
  return request<CreateArticleReqDto, CreateArticleResDto>({
    method: 'POST',
    url: '/articles',
    data: params,
  });
};

/**
 * 获取文章列表
 */
export const getArticles = (params?: GetArticlesReqDto) => {
  return request<GetArticlesReqDto, GetArticlesResDto>({
    method: 'GET',
    url: '/articles',
    params,
  });
};

/**
 * 获取文章详情
 */
export const getArticleById = (id: string) => {
  return request<null, CreateArticleResDto>({
    method: 'GET',
    url: `/articles/${id}`,
  });
};

/**
 * 删除文章
 */
export const deleteArticle = (id: string) => {
  return request<null, { message: string }>({
    method: 'DELETE',
    url: `/articles/${id}`,
  });
};
