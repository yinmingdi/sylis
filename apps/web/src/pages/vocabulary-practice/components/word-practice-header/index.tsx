import React from 'react';
import { AiOutlineHeart, AiOutlineRollback, AiFillHeart } from 'react-icons/ai';

import styles from './index.module.less';
import PageHeader from '../../../../components/page-header';

interface WordPracticeHeaderProps {
  progress: {
    completed: number;
    total: number;
  };
  isFavorited: boolean;
  hasPreviousWord: boolean;
  onBack: () => void;
  onPreviousWord: () => void;
  onToggleFavorite: () => void;
  onMarkAsFamiliar: () => void;
}

const WordPracticeHeader: React.FC<WordPracticeHeaderProps> = ({
  progress,
  isFavorited,
  hasPreviousWord,
  onBack,
  onPreviousWord,
  onToggleFavorite,
  onMarkAsFamiliar,
}) => {
  const progressText = `${progress.completed}/${progress.total}`;

  const headerActions = (
    <div className={styles.headerActions}>
      <div
        className={styles.headerActionButton}
        onClick={onPreviousWord}
        style={{ opacity: !hasPreviousWord ? 0.3 : 1 }}
      >
        <AiOutlineRollback />
      </div>
      <div
        className={styles.headerActionButton}
        onClick={onToggleFavorite}
      >
        {isFavorited ? <AiFillHeart className={styles.favorited} /> : <AiOutlineHeart />}
      </div>
      <div
        className={styles.headerActionButton}
        onClick={onMarkAsFamiliar}
      >
        熟
      </div>
    </div>
  );

  return (
    <PageHeader
      title=""
      onBack={onBack}
      actions={headerActions}
    >
      <div className={styles.progressContainer}>
        {progressText}
      </div>
    </PageHeader>
  );
};

export default WordPracticeHeader;
