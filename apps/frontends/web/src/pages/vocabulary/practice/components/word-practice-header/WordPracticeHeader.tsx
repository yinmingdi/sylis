import { show } from '@ebay/nice-modal-react';
import React from 'react';
import {
  AiOutlineHeart,
  AiFillHeart,
  AiOutlineFieldNumber,
} from 'react-icons/ai';

import type { DailyPlanWordDto } from '@/legacy-dto';

import styles from './index.module.less';
import { AppBar } from '../../../../../components/app-bar';
import { WordSpellingModal } from '../../../../../components/word-spelling';

interface WordPracticeHeaderProps {
  progress: {
    completed: number;
    total: number;
  };
  isFavorited: boolean;
  hasPreviousWord: boolean;
  currentWord: DailyPlanWordDto | null;
  onBack: () => void;
  onPreviousWord: () => void;
  onToggleFavorite: () => void | Promise<void>;
  onMarkAsFamiliar: () => void;
}

const WordPracticeHeader: React.FC<WordPracticeHeaderProps> = ({
  progress,
  isFavorited,
  currentWord,
  onBack,
  onToggleFavorite,
  onMarkAsFamiliar,
}) => {
  const progressText = `${progress.completed}/${progress.total}`;

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await onToggleFavorite();
  };

  const handleOpenSpelling = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!currentWord) return;

    // 获取第一个中文释义
    const meaning = currentWord.meanings?.[0]?.meaningCn || '';

    show(WordSpellingModal, {
      data: {
        word: currentWord.headword,
        meaning,
        phonetic: currentWord.usPhonetic || currentWord.ukPhonetic || undefined,
      },
      currentVoice: 'us',
      onComplete: (isCorrect, userInput) => {
        console.log('拼写完成:', isCorrect, userInput);
      },
    });
  };

  const headerActions = (
    <div className={styles.headerActions}>
      <div className={styles.headerActionButton} onClick={handleToggleFavorite}>
        {isFavorited ? (
          <AiFillHeart className={styles.favorited} />
        ) : (
          <AiOutlineHeart />
        )}
      </div>
      <div className={styles.headerActionButton} onClick={handleOpenSpelling}>
        <AiOutlineFieldNumber />
      </div>
      <div className={styles.headerActionButton} onClick={onMarkAsFamiliar}>
        熟
      </div>
    </div>
  );

  return (
    <AppBar title="" onBack={onBack} actions={headerActions}>
      <div className={styles.progressContainer}>{progressText}</div>
    </AppBar>
  );
};

export default WordPracticeHeader;
