import React, { useState } from 'react';
import { AiOutlineMinus, AiOutlinePlus } from 'react-icons/ai';

import type { CommentDto } from '@/legacy-dto';

import styles from './index.module.less';
import { InteractiveText } from '../../../../../components/interactive-text/InteractiveText';

interface CommentProps {
  comment: CommentDto;
  depth?: number;
  maxDepth?: number;
  onContinueThread?: (comment: CommentDto) => void;
}

export const Comment: React.FC<CommentProps> = ({
  comment,
  depth = 0,
  maxDepth = 10,
  onContinueThread,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 2);

  // 移动端最大缩进深度限制为2层
  const MAX_INDENT_DEPTH = 2;
  // 移动端使用更小的缩进值
  const INDENT_SIZE = 12;

  const hasReplies = comment.replies && comment.replies.length > 0;
  // 只有非顶层评论才能折叠
  const canCollapse = depth > 0;
  const shouldShowReplies = showReplies && hasReplies && !isCollapsed;

  // 计算实际缩进（限制最大缩进深度）
  const actualIndent = Math.min(depth, MAX_INDENT_DEPTH);
  const indentPx = actualIndent * INDENT_SIZE;

  // 是否显示"继续此线程"按钮（深度超过2且有回复）
  const shouldShowContinueThread = depth >= 2 && hasReplies && !isCollapsed;

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleToggleReplies = () => {
    setShowReplies(!showReplies);
  };

  const handleContinueThread = () => {
    if (onContinueThread) {
      onContinueThread(comment);
    }
  };

  const formatTimeAgo = (timestamp: Date | string) => {
    const now = new Date();
    const commentTime = new Date(timestamp);
    const diffInSeconds = Math.floor(
      (now.getTime() - commentTime.getTime()) / 1000,
    );

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000)
      return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
  };

  const renderCollapseButton = () => {
    if (!canCollapse) return null;

    return (
      <button
        className={styles.collapseButton}
        onClick={handleToggleCollapse}
        aria-label={isCollapsed ? '展开评论' : '折叠评论'}
      >
        {isCollapsed ? (
          <AiOutlinePlus className={styles.collapseIcon} />
        ) : (
          <AiOutlineMinus className={styles.collapseIcon} />
        )}
      </button>
    );
  };

  const renderCommentContent = () => {
    if (isCollapsed) {
      return (
        <div
          className={styles.collapsedContent}
          style={{ marginLeft: depth === 0 ? 0 : undefined }}
        >
          <span className={styles.collapsedText}>
            {comment.author} • {formatTimeAgo(comment.createdAt)}
            {hasReplies && ` • ${comment.replies?.length || 0} replies`}
          </span>
        </div>
      );
    }

    return (
      <div
        className={styles.commentContent}
        style={{ marginLeft: depth === 0 ? 0 : undefined }}
      >
        {/* 用户信息 */}
        <div className={styles.commentHeader}>
          <div className={styles.authorInfo}>
            <span className={styles.author}>{comment.author}</span>
            <span className={styles.timeAgo}>
              {formatTimeAgo(comment.createdAt)}
            </span>
            {comment.depth > 0 && <span className={styles.edited}>reply</span>}
          </div>
          {hasReplies && (
            <button
              className={styles.toggleRepliesButton}
              onClick={handleToggleReplies}
            >
              {showReplies ? '隐藏回复' : '显示回复'}
            </button>
          )}
        </div>

        {/* 评论内容 */}
        <div className={styles.commentBody}>
          <InteractiveText
            content={comment.content}
            features={{
              translation: true,
              grammarAnalysis: true,
            }}
          />
        </div>

        {/* 媒体内容 */}
        {comment.media && (
          <div className={styles.commentMedia}>
            {comment.media.type === 'image' && (
              <img
                src={comment.media.url}
                alt="Comment image"
                className={styles.mediaImage}
                loading="lazy"
              />
            )}
            {comment.media.type === 'video' && (
              <video
                src={comment.media.url}
                className={styles.mediaVideo}
                controls
                preload="metadata"
              >
                您的浏览器不支持视频播放
              </video>
            )}
            {comment.media.type === 'gif' && (
              <img
                src={comment.media.url}
                alt="Comment GIF"
                className={styles.mediaGif}
                loading="lazy"
              />
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className={styles.commentActions}>
          <button className={styles.actionButton}>
            <span className={styles.upvote}>▲</span>
            <span className={styles.score}>{comment.score}</span>
          </button>
          <button className={styles.actionButton}>
            <span className={styles.downvote}>▼</span>
          </button>
          <button className={styles.actionButton}>Reply</button>
          <button className={styles.actionButton}>Share</button>
          <button className={styles.actionButton}>Report</button>
        </div>

        {/* "继续此线程"按钮 */}
        {shouldShowContinueThread && (
          <button
            className={styles.continueThreadButton}
            onClick={handleContinueThread}
          >
            → 继续此线程 ({comment.replies?.length || 0} 条回复)
          </button>
        )}

        {/* 子评论 */}
        {shouldShowReplies && !shouldShowContinueThread && (
          <div className={styles.replies}>
            {comment.replies?.map((reply) => (
              <Comment
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                maxDepth={maxDepth}
                onContinueThread={onContinueThread}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (depth >= maxDepth) {
    return (
      <div
        className={styles.maxDepthReached}
        style={{ marginLeft: depth === 0 ? 0 : undefined }}
      >
        <span>评论层级过深，已折叠</span>
        <button
          className={styles.expandButton}
          onClick={() => setShowReplies(true)}
        >
          展开
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${styles.comment} ${isCollapsed ? styles.collapsed : ''}`}
      style={{
        paddingLeft: `${indentPx}px`,
        // 超过最大缩进深度后使用不同的背景色来区分层级
        backgroundColor:
          depth > MAX_INDENT_DEPTH
            ? `rgba(var(--adm-color-primary), ${Math.min((depth - MAX_INDENT_DEPTH) * 0.02, 0.08)})`
            : 'transparent',
      }}
      data-depth={depth}
    >
      {/* 折叠线 */}
      {depth > 0 && (
        <div
          className={styles.threadLine}
          style={{
            // 根据深度使用不同颜色
            backgroundColor: `hsl(${(depth * 30) % 360}, 60%, 70%)`,
          }}
        />
      )}

      {/* 折叠按钮 */}
      {renderCollapseButton()}

      {/* 评论内容 */}
      {renderCommentContent()}
    </div>
  );
};
