import NiceModal from '@ebay/nice-modal-react';
import { useCallback, useEffect, useRef } from 'react';

import { WordDetailModal } from '../components/word-detail-modal/WordDetailModal';

export interface UseGlobalWordInteractionOptions {
  enableClick?: boolean; // 是否启用点击选择单词
  enableTextSelection?: boolean; // 是否启用文本选择
  onWordClick?: (word: string) => void; // 单词点击回调
  onTextSelection?: (text: string) => void; // 文本选择回调
}

export const useGlobalWordInteraction = (
  options: UseGlobalWordInteractionOptions = {},
) => {
  const {
    enableClick = true,
    enableTextSelection = true,
    onWordClick,
    onTextSelection,
  } = options;

  const activeWordElementRef = useRef<HTMLElement | null>(null);

  const clearActiveWord = useCallback(() => {
    if (activeWordElementRef.current) {
      activeWordElementRef.current.classList.remove('active');
      activeWordElementRef.current = null;
    }
  }, []);

  const handleWordAction = useCallback(
    (text: string, element?: HTMLElement) => {
      const trimmedText = text.trim();
      if (trimmedText && trimmedText.length > 0) {
        if (onWordClick || onTextSelection) {
          // 优先使用自定义回调
          if (onWordClick) onWordClick(trimmedText);
          if (onTextSelection) onTextSelection(trimmedText);
        } else {
          // 添加 active 类名到单词元素
          if (element) {
            // 先清除之前的 active
            clearActiveWord();
            // 添加新的 active
            element.classList.add('active');
            activeWordElementRef.current = element;
          }

          // 默认行为：显示单词详情弹窗
          NiceModal.show(WordDetailModal, {
            text: trimmedText,
            onClose: clearActiveWord,
          });
        }
      }
    },
    [onWordClick, onTextSelection, clearActiveWord],
  );

  // 处理全局点击事件
  const handleGlobalClick = useCallback(
    (e: Event) => {
      if (!enableClick) return;

      const target = e.target as HTMLElement;
      const word = target.dataset.word;
      if (word) {
        handleWordAction(word, target);
      }
    },
    [enableClick, handleWordAction],
  );

  // 处理全局文本选择事件
  const handleGlobalPointerUp = useCallback(() => {
    if (!enableTextSelection) return;

    // 延迟一点时间，确保选择完成
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        const selectedText = selection.toString().trim();
        handleWordAction(selectedText);

        // 清除选择
        // selection.removeAllRanges();
      }
    }, 10);
  }, [enableTextSelection, handleWordAction]);

  useEffect(() => {
    // 在document.body上添加全局事件监听
    document.body.addEventListener('click', handleGlobalClick);
    document.body.addEventListener('pointerup', handleGlobalPointerUp);

    return () => {
      // 清理事件监听
      document.body.removeEventListener('click', handleGlobalClick);
      document.body.removeEventListener('pointerup', handleGlobalPointerUp);
      // 清理 active 状态
      clearActiveWord();
    };
  }, [handleGlobalClick, handleGlobalPointerUp, clearActiveWord]);
};
