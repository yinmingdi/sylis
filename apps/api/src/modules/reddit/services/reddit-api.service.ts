import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';

import type { RedditCommentListing } from '../types/reddit-comment.types';
import {
  RedditSortType,
  type RedditListing,
  type RedditTimeRange,
} from '../types/reddit-post.types';

@Injectable()
export class RedditApiService {
  private readonly logger = new Logger(RedditApiService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly userAgent: string;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(private readonly configService: ConfigService) {
    this.userAgent =
      this.configService.get<string>('REDDIT_USER_AGENT') || 'sylis/1.0';

    this.axiosInstance = axios.create({
      headers: {
        'User-Agent': this.userAgent,
      },
      timeout: 100000,
    });
  }

  /**
   * 获取 OAuth2 访问令牌
   */
  private async getAccessToken(): Promise<string | null> {
    // 如果 token 仍然有效，直接返回
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken as string;
    }

    const clientId = this.configService.get<string>('REDDIT_CLIENT_ID');
    const clientSecret = this.configService.get<string>('REDDIT_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      // 如果没有配置凭证，返回 null（使用公开 API）
      this.logger.warn(
        'Reddit API credentials not configured, using public JSON API',
      );
      return null;
    }

    try {
      const response = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        'grant_type=client_credentials',
        {
          auth: {
            username: clientId,
            password: clientSecret,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': this.userAgent,
          },
        },
      );

      this.accessToken = response.data.access_token;
      // Token 有效期 1 小时，提前 5 分钟刷新
      this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

      this.logger.log('Successfully obtained Reddit access token');
      return this.accessToken as string;
    } catch {
      this.logger.error('Failed to obtain Reddit access token');
      throw new Error('Failed to authenticate with Reddit API');
    }
  }

  /**
   * 发起 API 请求
   */
  private async request<T>(url: string, params?: any): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const headers: any = {
        'User-Agent': this.userAgent,
      };

      // 如果有 token，使用 OAuth API；否则使用公开 JSON API
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const baseURL = token
        ? 'https://oauth.reddit.com'
        : 'https://www.reddit.com';

      const response = await this.axiosInstance.get(url, {
        params,
        headers,
        baseURL,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error('Reddit API request failed', {
          url,
          status: error.response?.status,
        });
      }
      throw error;
    }
  }

  /**
   * 获取板块帖子列表
   */
  async getPosts(
    subreddit: string,
    sort: RedditSortType = RedditSortType.HOT,
    options?: {
      limit?: number;
      after?: string;
      timeRange?: RedditTimeRange;
    },
  ): Promise<RedditListing> {
    const params: any = {
      limit: options?.limit || 25,
      raw_json: 1,
    };

    if (options?.after) {
      params.after = options.after;
    }

    if (options?.timeRange && (sort === 'top' || sort === 'controversial')) {
      params.t = options.timeRange;
    }

    // 使用公开 JSON API 格式
    const url = `/r/${subreddit}/${sort}.json`;
    return this.request<RedditListing>(url, params);
  }

  /**
   * 获取帖子详情和评论
   */
  async getPostWithComments(
    subreddit: string,
    postId: string,
  ): Promise<[RedditListing, RedditCommentListing]> {
    const url = `/r/${subreddit}/comments/${postId}.json`;
    const response = await this.request<[RedditListing, RedditCommentListing]>(
      url,
      { raw_json: 1 },
    );
    return response;
  }

  /**
   * 搜索帖子
   */
  async searchPosts(
    query: string,
    options?: {
      subreddit?: string;
      sort?: string;
      limit?: number;
      after?: string;
    },
  ): Promise<RedditListing> {
    const params: any = {
      q: query,
      limit: options?.limit || 25,
      sort: options?.sort || 'relevance',
      raw_json: 1,
    };

    if (options?.after) {
      params.after = options.after;
    }

    const url = options?.subreddit
      ? `/r/${options.subreddit}/search.json`
      : '/search.json';

    return this.request<RedditListing>(url, params);
  }

  /**
   * 获取板块信息
   */
  async getSubredditInfo(subreddit: string) {
    const url = `/r/${subreddit}/about.json`;
    return this.request(url);
  }
}
