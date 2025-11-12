import type { SubredditDto } from '@sylis/shared/dto';
import { Toast } from 'antd-mobile';
import { useEffect, useState } from 'react';

import {
  getRecommendedSubreddits,
  getUserSubscriptions,
  subscribeSubreddit,
  unsubscribeSubreddit,
} from '../../../../modules/reddit/api';
import { useRedditStore } from '../../../../stores/reddit-store';

export function useSubreddits() {
  const [loading, setLoading] = useState(false);
  const [recommendedSubreddits, setRecommendedSubreddits] = useState<
    SubredditDto[]
  >([]);

  const {
    subscribedSubreddits,
    setSubscribedSubreddits,
    addSubscription,
    removeSubscription,
    categoryFilter,
    difficultyFilter,
  } = useRedditStore();

  /**
   * 加载推荐板块
   */
  const loadRecommended = async () => {
    setLoading(true);
    try {
      const response = await getRecommendedSubreddits({
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        difficulty: difficultyFilter || undefined,
      });
      setRecommendedSubreddits(response.subreddits);
    } catch (error) {
      console.error('Failed to load recommended subreddits:', error);
      Toast.show({
        content: '加载板块失败',
        icon: 'fail',
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * 加载用户订阅
   */
  const loadSubscriptions = async () => {
    try {
      const response = await getUserSubscriptions();
      setSubscribedSubreddits(response.subscriptions);
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    }
  };

  /**
   * 订阅板块
   */
  const subscribe = async (subredditName: string) => {
    try {
      await subscribeSubreddit({ subredditName });

      // 从推荐列表中找到该板块信息
      const subreddit = recommendedSubreddits.find(
        (s) => s.name === subredditName,
      );
      if (subreddit) {
        addSubscription({ ...subreddit, isSubscribed: true });
      }

      Toast.show({
        content: '订阅成功',
        icon: 'success',
      });

      // 重新加载推荐列表（更新订阅状态）
      await loadRecommended();
    } catch (error) {
      console.error('Failed to subscribe:', error);
      Toast.show({
        content: '订阅失败',
        icon: 'fail',
      });
    }
  };

  /**
   * 取消订阅
   */
  const unsubscribe = async (subredditName: string) => {
    try {
      await unsubscribeSubreddit(subredditName);
      removeSubscription(subredditName);

      Toast.show({
        content: '已取消订阅',
        icon: 'success',
      });

      // 重新加载推荐列表
      await loadRecommended();
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      Toast.show({
        content: '取消订阅失败',
        icon: 'fail',
      });
    }
  };

  /**
   * 检查是否已订阅
   */
  const isSubscribed = (subredditName: string) => {
    return subscribedSubreddits.some((sub) => sub.name === subredditName);
  };

  useEffect(() => {
    loadRecommended();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, difficultyFilter]);

  useEffect(() => {
    loadSubscriptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    loading,
    recommendedSubreddits,
    subscribedSubreddits,
    subscribe,
    unsubscribe,
    isSubscribed,
    refresh: () => {
      loadRecommended();
      loadSubscriptions();
    },
  };
}
