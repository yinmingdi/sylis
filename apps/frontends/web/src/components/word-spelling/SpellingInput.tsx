import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import styles from './index.module.less';

export interface SpellingInputProps {
  value: string;
  answer: string;
  isSubmitted: boolean;
  autoFocus?: boolean;
  className?: string;
  width?: number; // 输入框宽度（像素）
  onChange: (value: string) => void;
  onSubmit: () => void;
  onEditAfterSubmit?: () => void;
}

export const SpellingInput: React.FC<SpellingInputProps> = ({
  value,
  answer,
  isSubmitted,
  autoFocus = true,
  className,
  width,
  onChange,
  onSubmit,
  onEditAfterSubmit,
}) => {
  const inputRef = useRef<HTMLDivElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const pendingCursorPosRef = useRef<number | null>(null);
  const prevSubmittedRef = useRef<boolean>(isSubmitted);

  const focusInput = useCallback(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  // 初始化 & 当答案变化时重新聚焦
  useEffect(() => {
    focusInput();
  }, [focusInput, answer]);

  // 保持输入框聚焦
  useEffect(() => {
    const handleBlur = () => {
      focusInput();
    };

    const el = inputRef.current;
    if (el) {
      el.addEventListener('blur', handleBlur);
      return () => el.removeEventListener('blur', handleBlur);
    }
    return undefined;
  }, [focusInput]);

  const getCursorPosition = useCallback((): number => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !inputRef.current) return 0;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(inputRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }, []);

  const setCursorPosition = useCallback((position: number) => {
    requestAnimationFrame(() => {
      if (!inputRef.current) return;

      const sel = window.getSelection();
      if (!sel) return;

      let charCount = 0;
      let found = false;

      for (let i = 0; i < inputRef.current.childNodes.length; i++) {
        const node = inputRef.current.childNodes[i];
        const textNode = node.firstChild;

        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const nodeLength = textNode.textContent?.length || 0;

          if (charCount + nodeLength >= position) {
            const offset = position - charCount;
            const newRange = document.createRange();
            newRange.setStart(textNode, Math.min(offset, nodeLength));
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            found = true;
            break;
          }

          charCount += nodeLength;
        }
      }

      if (!found && inputRef.current.childNodes.length > 0) {
        const lastNode =
          inputRef.current.childNodes[inputRef.current.childNodes.length - 1];
        const lastTextNode = lastNode.firstChild;

        if (lastTextNode && lastTextNode.nodeType === Node.TEXT_NODE) {
          const newRange = document.createRange();
          newRange.setStart(
            lastTextNode,
            lastTextNode.textContent?.length || 0,
          );
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }
    });
  }, []);

  useLayoutEffect(() => {
    if (pendingCursorPosRef.current !== null) {
      setCursorPosition(pendingCursorPosRef.current);
      pendingCursorPosRef.current = null;
    }
  }, [value, setCursorPosition]);

  // 错误抖动动画
  useEffect(() => {
    if (!prevSubmittedRef.current && isSubmitted) {
      if (value.toLowerCase() !== answer.toLowerCase() && inputRef.current) {
        inputRef.current.classList.add(styles.shakeAnimation);
        const timer = window.setTimeout(() => {
          inputRef.current?.classList.remove(styles.shakeAnimation);
        }, 500);
        return () => window.clearTimeout(timer);
      }
    }
    prevSubmittedRef.current = isSubmitted;
    return undefined;
  }, [isSubmitted, value, answer]);

  const commitChange = useCallback(
    (nextValue: string, nextCursorPos: number) => {
      pendingCursorPosRef.current = nextCursorPos;
      onChange(nextValue);
    },
    [onChange],
  );

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLDivElement>) => {
    setIsComposing(false);
    const text = e.currentTarget.textContent || '';
    if (!isSubmitted) {
      commitChange(text, text.length);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isComposing) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
      return;
    }

    const cursorPos = getCursorPosition();
    let newText = value;
    let newCursorPos = cursorPos;

    const resetAfterSubmitIfNeeded = () => {
      if (isSubmitted) {
        onEditAfterSubmit?.();
      }
    };

    if (isSubmitted && value !== answer) {
      e.preventDefault();

      if (e.key === 'Backspace' || e.key === 'Delete') {
        resetAfterSubmitIfNeeded();
        commitChange('', 0);
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        resetAfterSubmitIfNeeded();
        commitChange(e.key, 1);
        return;
      }

      return;
    }

    if (isSubmitted && value === answer) {
      resetAfterSubmitIfNeeded();
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (cursorPos > 0) {
        newText = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        newCursorPos = cursorPos - 1;
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      if (cursorPos < value.length) {
        newText = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
        newCursorPos = cursorPos;
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (cursorPos > 0) {
        setCursorPosition(cursorPos - 1);
      }
      return;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (cursorPos < value.length) {
        setCursorPosition(cursorPos + 1);
      }
      return;
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursorPosition(0);
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursorPosition(value.length);
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      newText = value.slice(0, cursorPos) + e.key + value.slice(cursorPos);
      newCursorPos = cursorPos + 1;
    } else {
      return;
    }

    commitChange(newText, newCursorPos);
  };

  const renderContent = () => {
    const chars: React.ReactNode[] = [];

    for (let i = 0; i < value.length; i++) {
      const userChar = value[i];
      const correctChar = answer[i] || '';

      if (!isSubmitted) {
        chars.push(
          <span
            key={i}
            className={`${styles.resultChar} ${styles.correctChar}`}
          >
            {userChar}
          </span>,
        );
      } else {
        const isCorrect = userChar.toLowerCase() === correctChar.toLowerCase();
        chars.push(
          <span
            key={i}
            className={`${styles.resultChar} ${isCorrect ? styles.correctChar : styles.incorrectChar}`}
          >
            {userChar}
          </span>,
        );
      }
    }

    if (isSubmitted && value.length < answer.length) {
      for (let i = value.length; i < answer.length; i++) {
        chars.push(
          <span
            key={i}
            className={`${styles.resultChar} ${styles.missingChar}`}
          >
            _
          </span>,
        );
      }
    }

    return chars.length > 0 ? chars : null;
  };

  return (
    <div className={`${styles.wordDisplay} ${className || ''}`}>
      <div
        ref={inputRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder=""
        data-answer-length={answer.length}
        className={styles.spellingInput}
        style={
          width ? { width: `${width}px`, minWidth: `${width}px` } : undefined
        }
        onKeyDown={handleKeyDown}
        onInput={(e) => e.preventDefault()}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      >
        {renderContent()}
      </div>
    </div>
  );
};
