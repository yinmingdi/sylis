import type { RedditPostDto } from '@sylis/shared/dto';
import React from 'react';
import {
  AiOutlineArrowDown,
  AiOutlineArrowUp,
  AiOutlineMessage,
  AiOutlineShareAlt,
} from 'react-icons/ai';
import { MdOutlineBookmarkAdd, MdOutlineBookmarkRemove } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { InteractiveText } from '../../../../../components/interactive-text';

interface RedditPostProps {
  post: RedditPostDto;
  isSaved: boolean;
  isRead: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onMarkAsRead: () => void;
  showFullContent?: boolean; // 是否显示完整内容
  showActions?: boolean; // 是否显示操作按钮
}

export const RedditPost: React.FC<RedditPostProps> = ({
  post,
  isSaved,
  isRead,
  onSave,
  onUnsave,
  onMarkAsRead,
  showFullContent = true,
  showActions = true,
}) => {
  const navigate = useNavigate();

  const formatTimeAgo = (timestamp: Date | string) => {
    const now = new Date();
    const postTime = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - postTime.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return `${diffInSeconds}s ago`;
    }
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    }
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    }
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) {
      return `${diffInDays}d ago`;
    }
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return `${diffInMonths}mo ago`;
    }
    const diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears}y ago`;
  };

  const handleSaveToggle = () => {
    if (isSaved) {
      onUnsave();
    } else {
      onSave();
    }
  };

  const handleSubredditClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发帖子的点击事件
    navigate(`/reddit/subreddit/${post.subreddit}`);
  };

  return (
    <div className={styles.redditPost}>
      <div className={styles.postContainer}>
        {/* 帖子头部信息 */}
        <div className={styles.postHeader}>
          <div className={styles.subredditInfo}>
            <span
              className={styles.subredditName}
              onClick={handleSubredditClick}
            >
              r/{post.subreddit}
            </span>
            <span className={styles.separator}>•</span>
            <span className={styles.postMeta}>
              Posted by u/{post.author} {formatTimeAgo(post.createdAt)}
            </span>
          </div>
          {post.difficulty && (
            <span className={styles.postFlair}>{post.difficulty}</span>
          )}
        </div>

        {/* 帖子标题 */}
        <h2 className={styles.postTitle}>{post.title}</h2>

        {/* 帖子内容 */}
        {showFullContent && post.content && (
          <div className={styles.postContent}>
            <InteractiveText
              content={post.content}
              features={{
                translation: true,
                grammarAnalysis: true
              }}
            />
          </div>
        )}

        {/* 图片/媒体内容 */}
        {post.thumbnail &&
          post.thumbnail !== 'self' &&
          post.thumbnail !== 'default' &&
          post.thumbnail !== 'nsfw' && (
            <div className={styles.postMedia}>
              <img
                src={post.thumbnail}
                alt="Post content"
                loading="lazy"
              />
            </div>
          )}

        {/* 操作按钮 */}
        {showActions && (
          <div className={styles.postActions}>
            {/* 投票区域 */}
            <div className={styles.voteGroup}>
              <button className={styles.voteButton}>
                <AiOutlineArrowUp />
              </button>
              <span className={styles.score}>{post.score}</span>
              <button className={styles.voteButton}>
                <AiOutlineArrowDown />
              </button>
            </div>

            <button className={styles.actionButton}>
              <AiOutlineMessage />
              <span>{post.commentCount}</span>
            </button>

            <button className={styles.actionButton}>
              <AiOutlineShareAlt />
              <span>Share</span>
            </button>

            <button
              className={`${styles.actionButton} ${isSaved ? styles.saved : ''}`}
              onClick={handleSaveToggle}
            >
              {isSaved ? <MdOutlineBookmarkRemove /> : <MdOutlineBookmarkAdd />}
              <span>{isSaved ? 'Unsave' : 'Save'}</span>
            </button>

            {/* 标记已读按钮 */}
            {!isRead && (
              <button
                className={styles.actionButton}
                onClick={onMarkAsRead}
              >
                <span>Mark as Read</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
