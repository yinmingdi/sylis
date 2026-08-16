import React from 'react';

import styles from './index.module.less';

interface ArticleSkeletonProps {
  count?: number;
}

const ArticleSkeleton: React.FC<ArticleSkeletonProps> = ({ count = 3 }) => {
  return (
    <div className={styles.skeletonContainer}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.skeletonCard}>
          {/* 标题骨架 */}
          <div className={styles.skeletonTitle}>
            <div className={styles.skeletonLine} style={{ width: '85%' }} />
            <div className={styles.skeletonLine} style={{ width: '60%' }} />
          </div>

          {/* 元信息骨架 */}
          <div className={styles.skeletonMeta}>
            <div className={styles.skeletonMetaItem}>
              <div className={styles.skeletonIcon} />
              <div className={styles.skeletonText} style={{ width: '80px' }} />
            </div>
            <div className={styles.skeletonMetaItem}>
              <div className={styles.skeletonIcon} />
              <div className={styles.skeletonText} style={{ width: '60px' }} />
            </div>
            <div className={styles.skeletonMetaItem}>
              <div className={styles.skeletonIcon} />
              <div className={styles.skeletonText} style={{ width: '100px' }} />
            </div>
          </div>

          {/* 标签骨架 */}
          <div className={styles.skeletonTags}>
            <div className={styles.skeletonTag} />
            <div className={styles.skeletonTag} />
            <div className={styles.skeletonTag} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ArticleSkeleton;
