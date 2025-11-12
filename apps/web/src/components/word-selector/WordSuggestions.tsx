import { createPopper } from '@popperjs/core';
import type { Instance as PopperInstance } from '@popperjs/core';
import React, { useCallback, useEffect, useRef } from 'react';

import styles from './index.module.less';

// 临时类型定义，避免循环依赖
interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WordSuggestion {
  id: string;
  word: string;
  description?: string;
  tranCn?: string;
  phonetic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

interface WordSuggestionsProps {
  suggestions: WordSuggestion[];
  position: Position | null;
  visible: boolean;
  selectedIndex: number;
  onSelect: (suggestion: WordSuggestion) => void;
  onClose: () => void;
  loading?: boolean;
}

export const WordSuggestions: React.FC<WordSuggestionsProps> = ({
  suggestions,
  position,
  visible,
  selectedIndex,
  onSelect,
  onClose,
  loading = false,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const popperInstanceRef = useRef<PopperInstance | null>(null);

  // 创建虚拟元素用于 Popper 定位
  const createVirtualElement = useCallback((pos: NonNullable<typeof position>) => {
    return {
      getBoundingClientRect: () => ({
        width: pos.width,
        height: pos.height,
        top: pos.y,
        right: pos.x + pos.width,
        bottom: pos.y + pos.height,
        left: pos.x,
        x: pos.x,
        y: pos.y,
        toJSON: () => ({}),
      }),
    };
  }, []);

  // 更新 Popper 实例
  useEffect(() => {
    if (!visible || !position || !popupRef.current) {
      if (popperInstanceRef.current) {
        popperInstanceRef.current.destroy();
        popperInstanceRef.current = null;
      }
      return;
    }

    const virtualElement = createVirtualElement(position);

    if (popperInstanceRef.current) {
      popperInstanceRef.current.destroy();
    }

    popperInstanceRef.current = createPopper(virtualElement, popupRef.current, {
      placement: 'bottom-start',
      modifiers: [
        {
          name: 'offset',
          options: {
            offset: [0, 2],
          },
        },
        {
          name: 'preventOverflow',
          options: {
            padding: 8,
          },
        },
        {
          name: 'flip',
          options: {
            fallbackPlacements: ['top-start', 'bottom-end', 'top-end'],
          },
        },
      ],
    });

    return () => {
      if (popperInstanceRef.current) {
        popperInstanceRef.current.destroy();
        popperInstanceRef.current = null;
      }
    };
  }, [visible, position, createVirtualElement]);

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!visible) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          // 向下选择逻辑由父组件处理
          break;
        case 'ArrowUp':
          event.preventDefault();
          // 向上选择逻辑由父组件处理
          break;
        case 'Enter':
          event.preventDefault();
          if (suggestions[selectedIndex]) {
            onSelect(suggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
      }
    };

    if (visible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [visible, selectedIndex, suggestions, onSelect, onClose]);

  // 处理点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [visible, onClose]);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={popupRef}
      className={styles.suggestionsPopup}
      style={{ zIndex: 1000 }}
    >
      <div className={styles.suggestionsList}>
        {loading ? (
          <div className={styles.loadingItem}>
            <div className={styles.loadingText}>搜索中...</div>
          </div>
        ) : suggestions.length === 0 ? (
          <div className={styles.emptyItem}>
            <div className={styles.emptyText}>未找到相关单词</div>
          </div>
        ) : (
          suggestions.map((suggestion: any, index: number) => (
            <div
              key={suggestion.id}
              className={`${styles.suggestionItem} ${index === selectedIndex ? styles.selected : ''
                }`}
              onClick={() => onSelect(suggestion)}
              onMouseEnter={() => {
                // 鼠标悬停时更新选中索引的逻辑由父组件处理
              }}
            >
              <div className={styles.wordText}>{suggestion.word}</div>
              {suggestion.description && (
                <div className={styles.wordDescription}>{suggestion.description}</div>
              )}
              {suggestion.tranCn && (
                <div className={styles.wordMeaning}>{suggestion.tranCn}</div>
              )}
              {suggestion.phonetic && (
                <div className={styles.wordPhonetic}>/{suggestion.phonetic}/</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
