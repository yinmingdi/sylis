import type { DailyPlanWordDto } from '@sylis/shared/dto';
import React from 'react';

import styles from './index.module.less';
import { UnderlineActions } from '../../../../../components';
import WordDetail from '../../../../../components/word-detail/WordDetail';

interface WordDetailStageProps {
  currentWord: DailyPlanWordDto;
  hasNextWord: boolean;
  onNextWord: () => void;
}

const WordDetailStage: React.FC<WordDetailStageProps> = ({
  currentWord,
  hasNextWord,
  onNextWord,
}) => {
  const actions = hasNextWord
    ? [
      {
        label: '下一词',
        onClick: onNextWord,
        underlineColor: '#06d6a0',
      },
    ]
    : [];

  // 从 dailyProgress 中提取进度信息
  const requiredCorrectCount = currentWord.dailyProgress?.requiredCorrectCount;
  const correctCount = currentWord.dailyProgress?.correctCount ?? 0;

  return (
    <div className={styles.detailContainer}>
      <WordDetail
        className={styles.wordDetailStage}
        data={currentWord}
        requiredCorrectCount={requiredCorrectCount}
        correctCount={correctCount}
      />

      {/* 操作按钮 */}
      {actions.length > 0 && <UnderlineActions actions={actions} />}
    </div>
  );
};

export default WordDetailStage;

