import { useCallback, useEffect, useRef, useState } from 'react';

import type { RedditPostDto } from '@/legacy-dto';

import { getRedditPosts } from '../../../../modules/reddit/api';
import { useRedditStore } from '../../../../stores/reddit-store';

export function useRedditPosts(
  subreddit: string,
  sort: string = 'hot',
  options?: {
    limit?: number;
    timeRange?: string;
    enabled?: boolean;
  },
) {
  const [posts, setPosts] = useState<RedditPostDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [after, setAfter] = useState<string | undefined>();

  const loadingRef = useRef(false);
  const { setPosts: setCachePosts, getPosts: getCachePosts } = useRedditStore();

  const cacheKey = `${subreddit}:${sort}:${options?.limit || 25}`;

  const loadPosts = useCallback(
    async (refresh = false) => {
      if (options?.enabled === false) return;
      if (loadingRef.current) return; // 防止重复请求

      // 如果是首次加载，尝试从缓存获取
      if (refresh || posts.length === 0) {
        const cached = getCachePosts(cacheKey);
        if (cached && !refresh) {
          setPosts(cached);
          return;
        }
      }

      loadingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const response = await getRedditPosts({
          subreddit,
          sort,
          limit: options?.limit,
          after: refresh ? undefined : after,
          timeRange: options?.timeRange,
        });

        const newPosts = refresh
          ? response.posts
          : [...posts, ...response.posts];
        setPosts(newPosts);
        setHasMore(response.hasMore);
        setAfter(response.after);

        // 缓存首页数据
        if (refresh || posts.length === 0) {
          setCachePosts(cacheKey, newPosts);
        }
      } catch (err: any) {
        // 忽略取消的请求
        if (err.code !== 'ERR_CANCELED') {
          setError(err as Error);
          console.error('Failed to load posts:', err);
        }
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [
      subreddit,
      sort,
      options?.limit,
      options?.timeRange,
      options?.enabled,
      after,
      posts,
      cacheKey,
      getCachePosts,
      setCachePosts,
    ],
  );

  const refresh = useCallback(() => {
    setAfter(undefined);
    setPosts([]);
    loadPosts(true);
  }, [loadPosts]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore && !loadingRef.current) {
      loadPosts(false);
    }
  }, [loading, hasMore, loadPosts]);

  useEffect(() => {
    // 防止重复加载
    if (posts.length === 0 && !loadingRef.current) {
      loadPosts(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subreddit, sort]);

  return {
    posts,
    loading,
    error,
    hasMore,
    refresh,
    loadMore,
  };
}
