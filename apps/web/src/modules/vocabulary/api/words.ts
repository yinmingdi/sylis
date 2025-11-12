import type {
  SearchWordReqDto,
  SearchWordResDto,
  WordDetailResDto,
  TranslateTextReqDto,
} from '@sylis/shared/dto';

import { request } from '../../../network/request';

/**
 * 搜索单词
 */
export const searchWords = async (
  params: SearchWordReqDto,
): Promise<SearchWordResDto[]> => {
  const response = await request<SearchWordReqDto, SearchWordResDto[]>({
    url: '/words/search',
    method: 'GET',
    data: params,
  });
  return response.data;
};

/**
 * 获取单词详情（支持单词文本或ID）
 * @param wordOrId - 单词文本或单词ID
 */
export const getWordDetail = async (
  wordOrId: string,
): Promise<WordDetailResDto> => {
  const response = await request<never, WordDetailResDto>({
    url: `/words/${wordOrId}`,
    method: 'GET',
  });
  return response.data;
};

/**
 * 翻译文字（单词或句子），如果数据库没有则使用AI翻译
 * @param text - 要翻译的文字
 */
export const translateText = async (
  text: string,
): Promise<WordDetailResDto> => {
  const response = await request<TranslateTextReqDto, WordDetailResDto>({
    url: '/words/translate',
    method: 'POST',
    data: { text },
  });
  return response.data;
};
