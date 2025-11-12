import type {
  NotebookItemDto,
  GetNotebooksResDto,
  GetNotebookWordsReqDto,
  GetNotebookWordsResDto,
  AddWordToNotebookReqDto,
  AddWordToNotebookResDto,
  CreateNotebookReqDto,
  UpdateCollectedWordReqDto,
} from '@sylis/shared/dto';

import { request } from '../../../network/request';

// API 方法
export const vocabularyNotebookApi = {
  /**
   * 获取所有生词本
   */
  getNotebooks() {
    return request<void, GetNotebooksResDto>({
      url: '/vocabulary-notebooks',
      method: 'GET',
    });
  },

  /**
   * 创建生词本
   */
  createNotebook(data: CreateNotebookReqDto) {
    return request<CreateNotebookReqDto, NotebookItemDto>({
      url: '/vocabulary-notebooks',
      method: 'POST',
      data,
    });
  },

  /**
   * 获取生词本详情
   */
  getNotebookById(id: string) {
    return request<void, NotebookItemDto>({
      url: `/vocabulary-notebooks/${id}`,
      method: 'GET',
    });
  },

  /**
   * 更新生词本
   */
  updateNotebook(id: string, data: Partial<CreateNotebookReqDto>) {
    return request<Partial<CreateNotebookReqDto>, { success: boolean }>({
      url: `/vocabulary-notebooks/${id}`,
      method: 'PATCH',
      data,
    });
  },

  /**
   * 删除生词本
   */
  deleteNotebook(id: string) {
    return request<void, { success: boolean }>({
      url: `/vocabulary-notebooks/${id}`,
      method: 'DELETE',
    });
  },

  /**
   * 获取生词本的单词列表
   */
  getNotebookWords(id: string, params?: GetNotebookWordsReqDto) {
    return request<GetNotebookWordsReqDto, GetNotebookWordsResDto>({
      url: `/vocabulary-notebooks/${id}/words`,
      method: 'GET',
      data: params,
    });
  },

  /**
   * 添加单词到生词本
   */
  addWordToNotebook(id: string, data: AddWordToNotebookReqDto) {
    return request<AddWordToNotebookReqDto, AddWordToNotebookResDto>({
      url: `/vocabulary-notebooks/${id}/words`,
      method: 'POST',
      data,
    });
  },

  /**
   * 添加单词到默认生词本
   */
  addWordToDefaultNotebook(data: AddWordToNotebookReqDto) {
    return request<AddWordToNotebookReqDto, AddWordToNotebookResDto>({
      url: '/vocabulary-notebooks/default/words',
      method: 'POST',
      data,
    });
  },

  /**
   * 从默认生词本移除单词
   */
  removeWordFromDefaultNotebook(wordId: string) {
    return request<void, { success: boolean }>({
      url: `/vocabulary-notebooks/default/words/${wordId}`,
      method: 'DELETE',
    });
  },

  /**
   * 更新收藏单词信息
   */
  updateCollectedWord(
    notebookId: string,
    wordId: string,
    data: UpdateCollectedWordReqDto,
  ) {
    return request<UpdateCollectedWordReqDto, { success: boolean }>({
      url: `/vocabulary-notebooks/${notebookId}/words/${wordId}`,
      method: 'PATCH',
      data,
    });
  },

  /**
   * 从生词本移除单词
   */
  removeWordFromNotebook(notebookId: string, wordId: string) {
    return request<void, { success: boolean }>({
      url: `/vocabulary-notebooks/${notebookId}/words/${wordId}`,
      method: 'DELETE',
    });
  },

  /**
   * 获取生词本统计
   */
  getNotebookStats(id: string) {
    return request<
      void,
      {
        total: number;
        learnedCount: number;
        unlearnedCount: number;
        bySource: Array<{ source: string; _count: number }>;
      }
    >({
      url: `/vocabulary-notebooks/${id}/stats`,
      method: 'GET',
    });
  },
};
