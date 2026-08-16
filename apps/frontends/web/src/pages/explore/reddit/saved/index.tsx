import { Dialog, Empty } from 'antd-mobile';
import React, { useEffect, useState } from 'react';
import { AiOutlineDelete, AiOutlineArrowRight } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import type { SavedPostDto } from '@/legacy-dto';

import { getSavedPosts } from '../../../../modules/reddit/api';
import { useRedditInteraction } from '../hooks';
import styles from './index.module.less';
import { AppBar } from '../../../../components/app-bar';
import { PageView } from '../../../../components/view';

const SavedPage: React.FC = () => {
  const navigate = useNavigate();
  const [savedPosts, setSavedPosts] = useState<SavedPostDto[]>([]);
  const [loading, setLoading] = useState(true);

  const { unsavePost } = useRedditInteraction();

  useEffect(() => {
    loadSavedPosts();
  }, []);

  const loadSavedPosts = async () => {
    try {
      setLoading(true);
      const data = await getSavedPosts();
      setSavedPosts(data.savedPosts);
    } catch (error) {
      console.error('Failed to load saved posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostClick = (post: SavedPostDto) => {
    const id = post.redditId.replace('t3_', '');
    navigate(`/reddit/post/${id}?subreddit=${post.subreddit}`);
  };

  const handleDelete = async (e: React.MouseEvent, post: SavedPostDto) => {
    e.stopPropagation();
    const result = await Dialog.confirm({
      content: '确定要取消收藏这篇帖子吗？',
    });

    if (result) {
      const removed = await unsavePost(post.redditId);
      if (removed) {
        setSavedPosts((current) =>
          current.filter((savedPost) => savedPost.id !== post.id),
        );
      }
    }
  };

  const renderPostCard = (post: SavedPostDto) => (
    <div
      key={post.id}
      className={styles.postCard}
      onClick={() => handlePostClick(post)}
    >
      <div className={styles.postMain}>
        {post.thumbnail && (
          <div className={styles.thumbnailWrapper}>
            <img src={post.thumbnail} alt="" className={styles.thumbnail} />
          </div>
        )}
        <div className={styles.postInfo}>
          <h3 className={styles.postTitle}>{post.title}</h3>
          <div className={styles.postMeta}>
            <span>r/{post.subreddit}</span>
            <span>{new Date(post.savedAt).toLocaleDateString('zh-CN')}</span>
          </div>
          {post.notes && <p className={styles.notes}>📝 {post.notes}</p>}
        </div>
      </div>
      <div className={styles.cardActions}>
        <button
          className={styles.deleteBtn}
          onClick={(e) => handleDelete(e, post)}
        >
          <AiOutlineDelete />
        </button>
        <AiOutlineArrowRight className={styles.arrow} />
      </div>
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return <div className={styles.loadingText}>加载中...</div>;
    }

    if (savedPosts.length === 0) {
      return (
        <div className={styles.emptyState}>
          <Empty description="暂无收藏" />
        </div>
      );
    }

    return (
      <div className={styles.postList}>
        {savedPosts.map((post) => renderPostCard(post))}
      </div>
    );
  };

  return (
    <PageView
      className={styles.savedPage}
      appBar={
        <AppBar
          title="我的收藏"
          onBack={() => navigate(-1)}
          automaticallyImplyLeading={true}
        />
      }
    >
      <div className={styles.content}>{renderContent()}</div>
    </PageView>
  );
};

export default SavedPage;
