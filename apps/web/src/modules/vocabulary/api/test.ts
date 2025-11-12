import type {
  StartTestReqDto,
  StartTestResDto,
  CompleteTestReqDto,
  CompleteTestResDto,
  GetTestHistoryReqDto,
  GetTestHistoryResDto,
  GetTestDetailResDto,
} from '@sylis/shared/dto';

import { request } from '../../../network/request';

/**
 * 开始词汇量测试
 */
export const startVocabularyTest = (data?: StartTestReqDto) => {
  return request<StartTestReqDto, StartTestResDto>({
    url: '/vocabulary-tests/start',
    method: 'POST',
    data,
    timeout: 60000, // 60秒超时（生成选择题需要调用AI）
  });
};

/**
 * 完成词汇量测试
 */
export const completeVocabularyTest = (
  testId: string,
  data: CompleteTestReqDto,
) => {
  return request<CompleteTestReqDto, CompleteTestResDto>({
    url: `/vocabulary-tests/${testId}/complete`,
    method: 'POST',
    data,
  });
};

/**
 * 获取测试历史
 */
export const getTestHistory = (params?: GetTestHistoryReqDto) => {
  return request<GetTestHistoryReqDto, GetTestHistoryResDto>({
    url: '/vocabulary-tests/history',
    method: 'GET',
    data: params,
  });
};

/**
 * 获取测试详情
 */
export const getTestDetail = (testId: string) => {
  return request<void, GetTestDetailResDto>({
    url: `/vocabulary-tests/${testId}`,
    method: 'GET',
  });
};

/**
 * 删除测试记录
 */
export const deleteTest = (testId: string) => {
  return request<void, { success: boolean }>({
    url: `/vocabulary-tests/${testId}`,
    method: 'DELETE',
  });
};
