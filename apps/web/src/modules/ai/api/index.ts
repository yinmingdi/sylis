import type {
  ParseGrammarReqDto,
  ParseGrammarResDto,
  ParseMultipleGrammarReqDto,
  ParseMultipleGrammarResDto,
} from '@sylis/shared/dto';

import request from '../../../network/request';

const timeout = 100000;
/**
 * 解析单个句子的语法
 */
export const parseGrammar = (params: ParseGrammarReqDto) => {
  return request<ParseGrammarReqDto, ParseGrammarResDto>({
    method: 'POST',
    url: '/ai/parse-grammar',
    data: params,
    timeout,
  });
};

/**
 * 批量解析多个句子的语法
 */
export const parseMultipleGrammar = (params: ParseMultipleGrammarReqDto) => {
  return request<ParseMultipleGrammarReqDto, ParseMultipleGrammarResDto>({
    method: 'POST',
    url: '/ai/parse-multiple-grammar',
    data: params,
    timeout,
  });
};
