import { Skeleton } from 'antd-mobile';

import styles from './index.module.less';

const ArticleDetailSkeleton = () => {
  return (
    <div className={styles.pageContent}>
      {/* 文章内容卡片骨架 */}
      <div className={styles.articleContentCard}>
        <div className={styles.skeletonContainer}>
          {/* 文章标题骨架 */}
          <Skeleton.Title animated className={styles.skeletonTitle} />

          {/* 元信息骨架 */}
          <div className={styles.skeletonMetaContainer}>
            <div className={styles.skeletonMetaItem}>
              <Skeleton.Title animated className={styles.skeletonMetaIcon} />
              <Skeleton.Title animated className={styles.skeletonMetaText} />
            </div>
            <div className={styles.skeletonMetaItem}>
              <Skeleton.Title animated className={styles.skeletonMetaIcon} />
              <Skeleton.Title animated className={styles.skeletonMetaText} />
            </div>
            <div className={styles.skeletonMetaItem}>
              <Skeleton.Title animated className={styles.skeletonMetaIcon} />
              <Skeleton.Title animated className={styles.skeletonMetaText} />
            </div>
          </div>

          {/* 标签骨架 */}
          <div className={styles.skeletonTagsContainer}>
            <Skeleton.Title animated className={styles.skeletonTag} />
            <Skeleton.Title animated className={styles.skeletonTag} />
            <Skeleton.Title animated className={styles.skeletonTag} />
          </div>

          {/* 单词列表骨架 */}
          <div className={styles.skeletonWordsContainer}>
            <Skeleton.Title animated className={styles.skeletonWordTag} />
            <Skeleton.Title animated className={styles.skeletonWordTag} />
            <Skeleton.Title animated className={styles.skeletonWordTag} />
            <Skeleton.Title animated className={styles.skeletonWordTag} />
            <Skeleton.Title animated className={styles.skeletonWordTag} />
          </div>
        </div>

        {/* 分割线 */}
        <div className={styles.skeletonDivider} />

        {/* 文章内容骨架 */}
        <div className={styles.skeletonContent}>
          <Skeleton.Paragraph animated lineCount={8} />
          <Skeleton.Paragraph animated lineCount={6} />
          <Skeleton.Paragraph animated lineCount={4} />
        </div>
      </div>
    </div>
  );
};

export default ArticleDetailSkeleton;
