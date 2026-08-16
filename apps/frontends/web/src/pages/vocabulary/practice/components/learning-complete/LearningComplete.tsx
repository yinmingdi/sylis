import React from 'react';

import styles from './index.module.less';

interface LearningCompleteProps {
  completedCount: number;
  onBackToWords: () => void;
}

const LearningComplete: React.FC<LearningCompleteProps> = ({
  completedCount,
  onBackToWords,
}) => {
  return (
    <div className={styles.completeContainer}>
      <div className={styles.completeContent}>
        <div className={styles.completeIcon}>🎉</div>
        <div className={styles.completeTitle}>恭喜你！</div>
        <div className={styles.completeSubtitle}>今日学习已完成</div>
        <div className={styles.completeStats}>
          <div className={styles.statItem}>
            <div className={styles.statNumber}>{completedCount}</div>
            <div className={styles.statLabel}>已学词汇</div>
          </div>
        </div>
        <div className={styles.completeMessage}>
          坚持每天学习，你的英语水平会不断提升！
        </div>
        <div className={styles.completeActions}>
          <div className={styles.completeButton} onClick={onBackToWords}>
            完成
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningComplete;
