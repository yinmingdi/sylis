import type { CommentDto, GetPostDetailResDto } from '@sylis/shared/dto';
import { Toast } from 'antd-mobile';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  getRedditPostDetail,
  getRedditComments,
} from '../../../../modules/reddit/api';
import { Comment } from '../components/comment';
import { RedditPost } from '../components/reddit-post';
import { useRedditInteraction } from '../hooks';
import styles from './index.module.less';
import { AppBar } from '../../../../components/app-bar';
import { PageView } from '../../../../components/view';

const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const subreddit = searchParams.get('subreddit') || '';
  const navigate = useNavigate();

  const [post, setPost] = useState<GetPostDetailResDto | null>(null);
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordsLearned] = useState(0);

  // 深层评论线程状态 - 用于存储线程导航路径
  const [threadStack, setThreadStack] = useState<CommentDto[]>([]);

  const {
    isSaved,
    isRead,
    markAsRead,
    savePost: handleSavePost,
    unsavePost: handleUnsavePost
  } = useRedditInteraction(id);

  useEffect(() => {
    loadPost();
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, subreddit]);

  const loadPost = async () => {
    if (!id || !subreddit) return;

    try {
      setLoading(true);
      const data = await getRedditPostDetail(id, subreddit);
      setPost(data);
    } catch (error) {
      console.error('Failed to load post:', error);
      Toast.show({
        content: '加载失败',
        icon: 'fail',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    if (!id || !subreddit) return;

    try {
      const data = await getRedditComments(id, subreddit);
      setComments(data.comments);
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const handleMarkAsRead = () => {
    if (!post) return;

    markAsRead({
      redditId: `t3_${post.id}`,
      subreddit: post.subreddit,
      title: post.title,
      url: post.url,
      wordsLearned,
      difficulty: post.difficulty,
    });
  };

  const handleSave = () => {
    if (!post) return;

    handleSavePost({
      redditId: `t3_${post.id}`,
      subreddit: post.subreddit,
      title: post.title,
      url: post.url,
      thumbnail: post.thumbnail,
    });
  };

  const handleUnsave = () => {
    if (!post) return;

    handleUnsavePost(`t3_${post.id}`);
  };

  const handleContinueThread = (comment: CommentDto) => {
    // 将当前评论推入线程栈
    setThreadStack(prev => [...prev, comment]);
  };

  const handleBackToThread = () => {
    // 返回上一级线程
    setThreadStack(prev => prev.slice(0, -1));
  };

  const handleBackToRoot = () => {
    // 返回根评论列表
    setThreadStack([]);
  };

  const renderComment = (comment: CommentDto, depth = 0): React.ReactElement => (
    <Comment
      key={comment.id}
      comment={comment}
      depth={depth}
      onContinueThread={handleContinueThread}
    />
  );

  const renderComments = () => {
    if (comments.length === 0) return null;

    // 如果在线程视图中，只渲染当前线程
    const currentThread = threadStack.length > 0
      ? threadStack[threadStack.length - 1]
      : null;

    return (
      <div className={styles.commentsSection}>
        {/* 线程导航 */}
        {threadStack.length > 0 && (
          <div className={styles.threadNavigation}>
            <button
              className={styles.backButton}
              onClick={handleBackToThread}
            >
              ← 返回上一级
            </button>
            {threadStack.length > 1 && (
              <button
                className={styles.backToRootButton}
                onClick={handleBackToRoot}
              >
                返回全部评论
              </button>
            )}
            <div className={styles.threadInfo}>
              正在查看线程 · 第 {threadStack.length} 层
            </div>
          </div>
        )}

        <div className={styles.commentsList}>
          {currentThread ? (
            // 渲染单个线程评论（从 depth=0 开始）
            <Comment
              key={currentThread.id}
              comment={currentThread}
              depth={0}
              onContinueThread={handleContinueThread}
            />
          ) : (
            // 渲染所有顶层评论
            comments.map((comment) => renderComment(comment))
          )}
        </div>
      </div>
    );
  };

  if (loading || !post) {
    return (
      <div className={styles.postDetailPage}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh'
        }}>
          加载中...
        </div>
      </div>
    );
  }

  return (
    <PageView
      className={styles.postDetailPage}
      appBar={
        <AppBar
          title={`r/${post.subreddit}`}
          onBack={() => navigate(-1)}
          automaticallyImplyLeading={true}
        />
      }
    >
      <div className={styles.content}>
        {/* 使用 RedditPost 组件 */}
        <RedditPost
          post={post}
          isSaved={isSaved}
          isRead={isRead}
          onSave={handleSave}
          onUnsave={handleUnsave}
          onMarkAsRead={handleMarkAsRead}
          showFullContent={true}
          showActions={true}
        />

        {wordsLearned > 0 && (
          <div className={styles.statsCard}>
            <div className={styles.statsIcon}>📚</div>
            <div className={styles.statsText}>
              本文学到 <strong>{wordsLearned}</strong> 个新单词
            </div>
          </div>
        )}

        {renderComments()}
      </div>
    </PageView>
  );
};

export default PostDetailPage;

