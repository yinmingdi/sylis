import { Toast } from 'antd-mobile';
import { useEffect, useRef, useState } from 'react';

import {
  markPostAsRead,
  savePost,
  unsavePost,
  getSavedPosts,
  getReadHistory,
} from '../../../../modules/reddit/api';
import { useRedditStore } from '../../../../stores/reddit-store';

export function useRedditInteraction(postId?: string) {
  const [loading, setLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isRead, setIsRead] = useState(false);
  const interactionVersion = useRef(0);
  const { addSavedPost, removeSavedPost } = useRedditStore();

  // 检查帖子状态
  useEffect(() => {
    if (!postId) return;
    let active = true;
    const initialVersion = interactionVersion.current;

    const checkPostStatus = async () => {
      try {
        const [savedPosts, readHistory] = await Promise.all([
          getSavedPosts(),
          getReadHistory(),
        ]);
        if (!active || interactionVersion.current !== initialVersion) return;
        const redditId = `t3_${postId}`;
        setIsSaved(
          savedPosts.savedPosts.some((post) => post.redditId === redditId),
        );
        setIsRead(
          readHistory.history.some((item) => item.redditId === redditId),
        );
      } catch (error) {
        console.error('Failed to check post status:', error);
      }
    };

    void checkPostStatus();
    return () => {
      active = false;
    };
  }, [postId]);

  /**
   * 标记帖子为已读
   */
  const markAsRead = async (data: {
    redditId: string;
    subreddit: string;
    title: string;
    url: string;
    wordsLearned?: number;
    readDuration?: number;
    difficulty?: string;
  }) => {
    interactionVersion.current += 1;
    try {
      await markPostAsRead(data);
      setIsRead(true);

      // 更新统计（可选：重新获取统计数据）
      if (data.wordsLearned && data.wordsLearned > 0) {
        Toast.show({
          content: `本次学习了 ${data.wordsLearned} 个新单词`,
          icon: 'success',
        });
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
      Toast.show({
        content: '标记失败',
        icon: 'fail',
      });
    }
  };

  /**
   * 收藏帖子
   */
  const handleSavePost = async (data: {
    redditId: string;
    subreddit: string;
    title: string;
    url: string;
    thumbnail?: string;
    notes?: string;
  }) => {
    interactionVersion.current += 1;
    setLoading(true);
    try {
      await savePost(data);
      setIsSaved(true);

      addSavedPost({
        id: data.redditId,
        redditId: data.redditId,
        subreddit: data.subreddit,
        title: data.title,
        url: data.url,
        thumbnail: data.thumbnail,
        notes: data.notes,
        savedAt: new Date(),
      });

      Toast.show({
        content: '已收藏',
        icon: 'success',
      });
    } catch (error) {
      console.error('Failed to save post:', error);
      Toast.show({
        content: '收藏失败',
        icon: 'fail',
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * 取消收藏
   */
  const handleUnsavePost = async (redditId: string) => {
    interactionVersion.current += 1;
    setLoading(true);
    try {
      await unsavePost(redditId);
      setIsSaved(false);
      removeSavedPost(redditId);

      Toast.show({
        content: '已取消收藏',
        icon: 'success',
      });
      return true;
    } catch (error) {
      console.error('Failed to unsave post:', error);
      Toast.show({
        content: '取消收藏失败',
        icon: 'fail',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    isSaved,
    isRead,
    markAsRead,
    savePost: handleSavePost,
    unsavePost: handleUnsavePost,
  };
}
