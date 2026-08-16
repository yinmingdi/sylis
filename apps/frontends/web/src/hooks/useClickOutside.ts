import { useEffect, useRef } from 'react';

export interface UseClickOutsideOptions {
  /**
   * 点击外部时的回调函数
   */
  onClickOutside: (event: PointerEvent) => void;
  /**
   * 是否禁用该功能
   */
  disabled?: boolean;
  /**
   * 额外的元素引用，点击这些元素时不会触发回调
   */
  excludeRefs?: React.RefObject<HTMLElement>[];
}

/**
 * 监听点击外部区域的 hook
 * @param ref - 需要监听的目标元素引用
 * @param options - 配置选项
 */
export const useClickOutside = <T extends HTMLElement = HTMLElement>(
  ref: React.RefObject<T | null>,
  options: UseClickOutsideOptions,
) => {
  const { onClickOutside, disabled = false, excludeRefs = [] } = options;

  const callbackRef = useRef(onClickOutside);

  // 保持回调函数引用最新
  useEffect(() => {
    callbackRef.current = onClickOutside;
  }, [onClickOutside]);

  useEffect(() => {
    if (disabled) return;

    const handleClickOutside = (event: PointerEvent) => {
      const target = event.target as Node;

      // 检查是否点击在目标元素内
      if (ref.current && ref.current.contains(target)) {
        return;
      }

      // 检查是否点击在排除的元素内
      if (
        excludeRefs.some((excludeRef) => excludeRef.current?.contains(target))
      ) {
        return;
      }

      // 如果是触摸设备，检查是否是滚动操作
      if (event.pointerType === 'touch') {
        let isScrolling = false;
        const startY = event.clientY;
        const startX = event.clientX;

        const handlePointerMove = (moveEvent: PointerEvent) => {
          const deltaY = Math.abs(moveEvent.clientY - startY);
          const deltaX = Math.abs(moveEvent.clientX - startX);

          // 如果移动距离超过阈值，认为是滚动
          if (deltaY > 5 || deltaX > 5) {
            isScrolling = true;
          }
        };

        const handlePointerUp = () => {
          document.removeEventListener('pointermove', handlePointerMove);
          document.removeEventListener('pointerup', handlePointerUp);

          // 只有在不是滚动的情况下才触发回调
          if (!isScrolling) {
            callbackRef.current(event);
          }
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
      } else {
        // 对于鼠标和笔，直接触发回调
        callbackRef.current(event);
      }
    };

    // 使用 pointerdown 统一处理鼠标、触摸、笔等输入
    document.addEventListener('pointerdown', handleClickOutside);

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [ref, disabled, excludeRefs, onClickOutside]);
};
