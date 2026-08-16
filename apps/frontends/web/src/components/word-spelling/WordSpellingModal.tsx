import { create, useModal } from '@ebay/nice-modal-react';
import { useCallback, useEffect } from 'react';

import { PageView } from '../view';
import styles from './index.module.less';
import WordSpelling, { type WordSpellingData } from './WordSpelling';

export interface WordSpellingModalProps {
  data: WordSpellingData;
  currentVoice?: 'us' | 'uk';
  onComplete?: (isCorrect: boolean, userInput: string) => void;
  onPlayAudio?: () => void;
  onClose?: () => void;
}

export const WordSpellingModal = create(
  ({ data, onComplete, onClose }: WordSpellingModalProps) => {
    const modal = useModal();

    // 处理关闭
    const handleClose = useCallback(() => {
      modal.hide();
      onClose?.();
    }, [modal, onClose]);

    // 处理完成
    const handleComplete = useCallback(
      (isCorrect: boolean, userInput: string) => {
        onComplete?.(isCorrect, userInput);
        // 回答正确后直接关闭 modal
        if (isCorrect) {
          handleClose();
        }
      },
      [onComplete, handleClose],
    );

    // 监听 ESC 键关闭
    useEffect(() => {
      if (!modal.visible) return;

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      };

      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }, [modal.visible, handleClose]);

    // 关闭后直接移除
    useEffect(() => {
      if (!modal.visible) {
        modal.remove();
      }
    }, [modal.visible, modal]);

    return (
      <PageView
        className={styles.wordSpellingModal}
        bodyClassName={styles.wordSpellingModalBody}
      >
        <WordSpelling
          data={data}
          onComplete={handleComplete}
          onClose={handleClose}
        />
      </PageView>
    );
  },
);

export default WordSpellingModal;
