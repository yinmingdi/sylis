import { Skeleton } from 'antd-mobile';

import styles from './index.module.less';

const WordDetailSkeleton = () => {
  return (
    <div className={styles.skeletonContainer}>
      {/* 单词标题行骨架 */}
      <div className={styles.skeletonTitleRow}>
        <Skeleton.Title animated className={styles.skeletonWord} />
        <div className={styles.skeletonActionButtons}>
          <Skeleton.Title animated className={styles.skeletonButton} />
          <Skeleton.Title animated className={styles.skeletonButton} />
        </div>
      </div>

      {/* 释义骨架 */}
      <div className={styles.skeletonMeanings}>
        <div className={styles.skeletonMeaningItem}>
          <Skeleton.Title animated className={styles.skeletonPartOfSpeech} />
          <Skeleton.Paragraph
            animated
            lineCount={2}
            className={styles.skeletonMeaningText}
          />
        </div>
      </div>
    </div>
  );
};

export default WordDetailSkeleton;
