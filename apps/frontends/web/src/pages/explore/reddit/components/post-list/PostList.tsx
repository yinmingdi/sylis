import { Empty, PullToRefresh } from 'antd-mobile';
import React from 'react';
import {
  AiOutlineFire,
  AiOutlineStar,
  AiOutlineClockCircle,
  AiOutlineArrowRight,
} from 'react-icons/ai';

import type { RedditPostDto } from '@/legacy-dto';

import { RedditPost } from '../reddit-post';
import styles from './index.module.less';

export interface PostListProps {
  posts: RedditPostDto[];
  loading?: boolean;
  error?: Error | null;
  sort?: string;
  onSortChange?: (sort: string) => void;
  onPostClick?: (postId: string) => void;
  onRefresh?: () => void | Promise<void>;
  showSortBar?: boolean;
  emptyText?: string;
  errorText?: string;
}

export const PostList: React.FC<PostListProps> = ({
  posts,
  loading = false,
  error = null,
  sort = 'hot',
  onSortChange,
  onPostClick,
  onRefresh,
  showSortBar = true,
  emptyText = '暂无内容',
  errorText = '加载失败，请重试',
}) => {
  const sortOptions = [
    { key: 'hot', label: 'Best', icon: <AiOutlineFire /> },
    { key: 'new', label: 'New', icon: <AiOutlineClockCircle /> },
    { key: 'top', label: 'Top', icon: <AiOutlineStar /> },
  ];

  const handleSortChange = (newSort: string) => {
    if (onSortChange) {
      onSortChange(newSort);
    }
  };

  const handlePostClick = (postId: string) => {
    if (onPostClick) {
      onPostClick(postId);
    }
  };

  const renderSortBar = () => {
    if (!showSortBar) return null;

    return (
      <div className={styles.sortBar}>
        {sortOptions.map((option) => (
          <div
            key={option.key}
            className={`${styles.sortOption} ${sort === option.key ? styles.active : ''}`}
            onClick={() => handleSortChange(option.key)}
          >
            {option.icon}
            <span>{option.label}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderPostCard = (post: RedditPostDto) => (
    <div
      key={post.id}
      className={styles.postCard}
      onClick={() => handlePostClick(post.id)}
    >
      <RedditPost
        post={post}
        isSaved={false}
        isRead={false}
        onSave={() => {}}
        onUnsave={() => {}}
        onMarkAsRead={() => {}}
        showFullContent={false}
        showActions={true}
      />
      <AiOutlineArrowRight className={styles.arrow} />
    </div>
  );

  const renderContent = () => {
    if (error) {
      return (
        <div className={styles.emptyState}>
          <Empty description={errorText} />
        </div>
      );
    }

    if (!loading && posts.length === 0) {
      return (
        <div className={styles.emptyState}>
          <Empty description={emptyText} />
        </div>
      );
    }

    return (
      <div className={styles.postList}>
        {posts.map((post) => renderPostCard(post))}
        {loading && <div className={styles.loadingText}>加载中...</div>}
      </div>
    );
  };

  const content = (
    <div className={styles.content}>
      {renderSortBar()}
      {renderContent()}
    </div>
  );

  // 如果提供了 onRefresh，则包裹 PullToRefresh
  if (onRefresh) {
    const handleRefresh = async () => {
      await Promise.resolve(onRefresh());
    };
    return <PullToRefresh onRefresh={handleRefresh}>{content}</PullToRefresh>;
  }

  return content;
};
