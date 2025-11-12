import type {
  GetCommentsResDto,
  GetHistoryResDto,
  GetPostDetailResDto,
  GetPostsResDto,
  GetRecommendedSubredditsResDto,
  GetSavedPostsResDto,
  GetStatsResDto,
  GetUserSubscriptionsResDto,
  MarkReadReqDto,
  MarkReadResDto,
  SavePostReqDto,
  SavePostResDto,
  SearchPostsResDto,
  SubscribeReqDto,
  SubscribeResDto,
} from '@sylis/shared/dto';

import { request } from '../../../network/request';

/**
 * Reddit API 请求层
 */

// 获取帖子列表
export const getRedditPosts = async (params: {
  subreddit: string;
  sort?: string;
  limit?: number;
  after?: string;
  timeRange?: string;
}): Promise<GetPostsResDto> => {
  const response = await request<typeof params, GetPostsResDto>({
    url: '/reddit/posts',
    method: 'GET',
    data: params,
    timeout: 10000,
  });
  return response.data;
};

// 获取帖子详情
export const getRedditPostDetail = async (
  postId: string,
  subreddit: string,
): Promise<GetPostDetailResDto> => {
  const response = await request<{ subreddit: string }, GetPostDetailResDto>({
    url: `/reddit/posts/${postId}`,
    method: 'GET',
    data: { subreddit },
    timeout: 100000,
  });
  return response.data;
};

// 获取评论
export const getRedditComments = async (
  postId: string,
  subreddit: string,
): Promise<GetCommentsResDto> => {
  const response = await request<{ subreddit: string }, GetCommentsResDto>({
    url: `/reddit/posts/${postId}/comments`,
    method: 'GET',
    data: { subreddit },
  });
  return response.data;
};

// 搜索帖子
export const searchRedditPosts = async (params: {
  query: string;
  subreddit?: string;
  sort?: string;
  limit?: number;
  after?: string;
}): Promise<SearchPostsResDto> => {
  const response = await request<typeof params, SearchPostsResDto>({
    url: '/reddit/search',
    method: 'GET',
    data: params,
  });
  return response.data;
};

// 获取推荐板块
export const getRecommendedSubreddits = async (params?: {
  category?: string;
  difficulty?: string;
}): Promise<GetRecommendedSubredditsResDto> => {
  const response = await request<typeof params, GetRecommendedSubredditsResDto>(
    {
      url: '/reddit/subreddits/recommended',
      method: 'GET',
      data: params,
    },
  );
  return response.data;
};

// 获取用户订阅列表
export const getUserSubscriptions =
  async (): Promise<GetUserSubscriptionsResDto> => {
    const response = await request<never, GetUserSubscriptionsResDto>({
      url: '/reddit/subreddits/subscribed',
      method: 'GET',
    });
    return response.data;
  };

// 订阅板块
export const subscribeSubreddit = async (
  data: SubscribeReqDto,
): Promise<SubscribeResDto> => {
  const response = await request<SubscribeReqDto, SubscribeResDto>({
    url: '/reddit/subreddits/subscribe',
    method: 'POST',
    data,
  });
  return response.data;
};

// 取消订阅
export const unsubscribeSubreddit = async (
  name: string,
): Promise<SubscribeResDto> => {
  const response = await request<never, SubscribeResDto>({
    url: `/reddit/subreddits/unsubscribe/${name}`,
    method: 'DELETE',
  });
  return response.data;
};

// 标记已读
export const markPostAsRead = async (
  data: MarkReadReqDto,
): Promise<MarkReadResDto> => {
  const response = await request<MarkReadReqDto, MarkReadResDto>({
    url: '/reddit/mark-read',
    method: 'POST',
    data,
  });
  return response.data;
};

// 收藏帖子
export const savePost = async (
  data: SavePostReqDto,
): Promise<SavePostResDto> => {
  const response = await request<SavePostReqDto, SavePostResDto>({
    url: '/reddit/save',
    method: 'POST',
    data,
  });
  return response.data;
};

// 取消收藏
export const unsavePost = async (redditId: string): Promise<SavePostResDto> => {
  const response = await request<never, SavePostResDto>({
    url: `/reddit/save/${redditId}`,
    method: 'DELETE',
  });
  return response.data;
};

// 获取收藏列表
export const getSavedPosts = async (): Promise<GetSavedPostsResDto> => {
  const response = await request<never, GetSavedPostsResDto>({
    url: '/reddit/saved',
    method: 'GET',
  });
  return response.data;
};

// 获取阅读历史
export const getReadHistory = async (): Promise<GetHistoryResDto> => {
  const response = await request<never, GetHistoryResDto>({
    url: '/reddit/history',
    method: 'GET',
  });
  return response.data;
};

// 获取学习统计
export const getRedditStats = async (): Promise<GetStatsResDto> => {
  const response = await request<never, GetStatsResDto>({
    url: '/reddit/stats',
    method: 'GET',
  });
  return response.data;
};
