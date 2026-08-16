import { Toast } from 'antd-mobile';
import { useState, useCallback } from 'react';

import type { CollectionSource } from '@/legacy-dto';

import { vocabularyNotebookApi } from '../modules/vocabulary/api';

interface UseWordCollectionOptions {
  onSuccess?: (wordId: string, isCollected: boolean) => void;
  onError?: (error: any) => void;
}

/**
 * 单词收藏功能 Hook
 * 用于在各个页面中统一处理单词收藏/取消收藏操作
 */
export function useWordCollection(options?: UseWordCollectionOptions) {
  const [loading, setLoading] = useState(false);
  const [collectedWords, setCollectedWords] = useState<Set<string>>(new Set());

  /**
   * 切换单词收藏状态
   * @param wordId 单词ID
   * @param isCollected 当前是否已收藏
   * @param source 收藏来源（可选）
   */
  const toggleCollection = useCallback(
    async (
      wordId: string,
      isCollected: boolean,
      source?: CollectionSource,
      context?: string,
    ) => {
      setLoading(true);
      try {
        if (isCollected) {
          // 取消收藏：从默认生词本移除（使用快捷方法）
          await vocabularyNotebookApi.removeWordFromDefaultNotebook(wordId);

          setCollectedWords((prev) => {
            const newSet = new Set(prev);
            newSet.delete(wordId);
            return newSet;
          });

          Toast.show({
            content: '已从生词本移除',
            icon: 'success',
            duration: 1000,
          });

          options?.onSuccess?.(wordId, false);
        } else {
          // 添加收藏：添加到默认生词本
          await vocabularyNotebookApi.addWordToDefaultNotebook({
            wordId,
            source,
            context,
          });

          setCollectedWords((prev) => new Set(prev).add(wordId));

          Toast.show({
            content: '已加入生词本',
            icon: 'success',
            duration: 1000,
          });

          options?.onSuccess?.(wordId, true);
        }
      } catch (error: any) {
        const errorMessage =
          error?.response?.data?.msg ||
          error?.response?.data?.message ||
          error?.message ||
          (isCollected ? '移除失败' : '收藏失败');

        Toast.show({
          content: errorMessage,
          icon: 'fail',
          duration: 2000,
        });

        options?.onError?.(error);
      } finally {
        setLoading(false);
      }
    },
    [options],
  );

  /**
   * 批量设置已收藏的单词
   * 用于初始化时设置哪些单词已被收藏
   */
  const setCollected = useCallback((wordIds: string[]) => {
    setCollectedWords(new Set(wordIds));
  }, []);

  /**
   * 检查单词是否已收藏
   */
  const isCollected = useCallback(
    (wordId: string) => {
      return collectedWords.has(wordId);
    },
    [collectedWords],
  );

  return {
    toggleCollection,
    setCollected,
    isCollected,
    loading,
    collectedWords,
  };
}
