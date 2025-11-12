import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  getSubredditByName,
  getSubredditsByCategory,
  RECOMMENDED_SUBREDDITS,
} from './config/subreddit-categories';
import {
  CommentDto,
  GetCommentsResDto,
  GetPostDetailResDto,
  GetPostsResDto,
  GetRecommendedSubredditsResDto,
  GetStatsResDto,
  GetUserSubscriptionsResDto,
  MarkReadReqDto,
  RedditPostDto,
  SavePostReqDto,
  SearchPostsResDto,
  SubredditDto,
} from './dto';
import { RedditAnalyzeService } from './services/reddit-analyze.service';
import { RedditApiService } from './services/reddit-api.service';
import { RedditCacheService } from './services/reddit-cache.service';
import { RedditUserService } from './services/reddit-user.service';
import type { RedditComment } from './types/reddit-comment.types';
import {
  RedditSortType,
  type RedditPost,
  type RedditTimeRange,
} from './types/reddit-post.types';
import {
  SubredditCategory,
  type DifficultyLevel,
} from './types/subreddit.types';

@Injectable()
export class RedditService {
  private readonly logger = new Logger(RedditService.name);

  constructor(
    private readonly redditApi: RedditApiService,
    private readonly cacheService: RedditCacheService,
    private readonly userService: RedditUserService,
    private readonly analyzeService: RedditAnalyzeService,
  ) {}

  /**
   * 获取帖子列表
   */
  async getPosts(
    subreddit: string,
    sort: RedditSortType = RedditSortType.HOT,
    options?: {
      limit?: number;
      after?: string;
      timeRange?: RedditTimeRange;
    },
  ): Promise<GetPostsResDto> {
    const limit = options?.limit || 25;

    // 尝试从缓存获取
    const cached = await this.cacheService.getPostsCache(
      subreddit,
      sort,
      limit,
      options?.after,
    );
    if (cached) {
      this.logger.debug(`Cache hit for r/${subreddit}/${sort}`);
      return cached;
    }

    // 调用 Reddit API
    const listing = await this.redditApi.getPosts(subreddit, sort, options);

    // 转换数据格式
    const posts = listing.data.children.map((child) =>
      this.transformPost(child.data),
    );

    const result: GetPostsResDto = {
      posts,
      after: listing.data.after || undefined,
      hasMore: !!listing.data.after,
    };

    // 缓存结果
    await this.cacheService.setPostsCache(
      subreddit,
      sort,
      limit,
      result,
      options?.after,
    );

    return result;
  }

  /**
   * 获取帖子详情
   */
  async getPostDetail(
    subreddit: string,
    postId: string,
  ): Promise<GetPostDetailResDto> {
    // 尝试从缓存获取
    const cached = await this.cacheService.getPostDetailCache(postId);
    if (cached) {
      this.logger.debug(`Cache hit for post ${postId}`);
      return cached;
    }

    // 调用 Reddit API
    const [postListing] = await this.redditApi.getPostWithComments(
      subreddit,
      postId,
    );

    if (!postListing.data.children[0]) {
      throw new NotFoundException(`Post ${postId} not found`);
    }

    const post = postListing.data.children[0].data;
    const result = {
      ...this.transformPost(post),
      fullContent: post.selftext || '',
      upvoteRatio: post.upvote_ratio,
    };

    // 缓存结果
    await this.cacheService.setPostDetailCache(postId, result);

    return result;
  }

  /**
   * 获取评论列表
   */
  async getComments(
    subreddit: string,
    postId: string,
  ): Promise<GetCommentsResDto> {
    const [, commentListing] = await this.redditApi.getPostWithComments(
      subreddit,
      postId,
    );

    const comments = commentListing.data.children
      .filter((child) => child.kind === 't1')
      .map((child) => this.processComment(child.data as RedditComment));

    return {
      comments,
      totalCount: comments.length,
    };
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
  ): Promise<SearchPostsResDto> {
    const subreddit = options?.subreddit || 'all';
    const sort = options?.sort || 'relevance';
    const limit = options?.limit || 25;

    // 尝试从缓存获取
    const cached = await this.cacheService.getSearchCache(
      query,
      subreddit,
      sort,
      limit,
    );
    if (cached) {
      this.logger.debug(`Cache hit for search: ${query}`);
      return cached;
    }

    // 调用 Reddit API
    const listing = await this.redditApi.searchPosts(query, options);

    const posts = listing.data.children.map((child) =>
      this.transformPost(child.data),
    );

    const result: SearchPostsResDto = {
      posts,
      after: listing.data.after || undefined,
      hasMore: !!listing.data.after,
      totalCount: listing.data.dist || posts.length,
    };

    // 缓存结果
    await this.cacheService.setSearchCache(
      query,
      subreddit,
      sort,
      limit,
      result,
    );

    return result;
  }

  /**
   * 获取推荐板块
   */
  async getRecommendedSubreddits(
    userId: string,
    category?: SubredditCategory,
    difficulty?: DifficultyLevel,
  ): Promise<GetRecommendedSubredditsResDto> {
    let subreddits = RECOMMENDED_SUBREDDITS;

    if (category && category !== SubredditCategory.ALL) {
      subreddits = getSubredditsByCategory(category);
    }

    if (difficulty) {
      subreddits = subreddits.filter((sub) => sub.difficulty === difficulty);
    }

    // 检查用户订阅状态
    const subscriptions = await this.userService.getSubscriptions(userId);
    const subscribedNames = new Set(
      subscriptions.map((sub) => sub.subredditName),
    );

    const result = subreddits.map((sub) => ({
      name: sub.name,
      displayName: sub.displayName,
      description: sub.description,
      category: sub.category,
      difficulty: sub.difficulty,
      color: sub.color,
      icon: sub.icon,
      isSubscribed: subscribedNames.has(sub.name),
    }));

    return { subreddits: result };
  }

  /**
   * 获取用户订阅列表
   */
  async getUserSubscriptions(
    userId: string,
  ): Promise<GetUserSubscriptionsResDto> {
    const subscriptions = await this.userService.getSubscriptions(userId);

    const result: SubredditDto[] = subscriptions.map((sub) => {
      const config = getSubredditByName(sub.subredditName);
      return {
        name: sub.subredditName,
        displayName:
          sub.displayName || config?.displayName || sub.subredditName,
        description: config?.description,
        category: sub.category || config?.category || '',
        difficulty: sub.difficulty || config?.difficulty || '',
        color: config?.color,
        icon: config?.icon,
        isSubscribed: true,
      };
    });

    return { subscriptions: result };
  }

  /**
   * 订阅板块
   */
  async subscribe(userId: string, subredditName: string) {
    const config = getSubredditByName(subredditName);
    await this.userService.subscribe(userId, subredditName, {
      category: config?.category,
      difficulty: config?.difficulty,
      displayName: config?.displayName,
    });
    return { success: true, message: 'Subscribed successfully' };
  }

  /**
   * 取消订阅
   */
  async unsubscribe(userId: string, subredditName: string) {
    await this.userService.unsubscribe(userId, subredditName);
    return { success: true, message: 'Unsubscribed successfully' };
  }

  /**
   * 标记已读
   */
  async markAsRead(userId: string, data: MarkReadReqDto) {
    await this.userService.markAsRead(userId, data);
    return { success: true, message: 'Marked as read' };
  }

  /**
   * 收藏帖子
   */
  async savePost(userId: string, data: SavePostReqDto) {
    await this.userService.savePost(userId, data);
    return { success: true, message: 'Post saved' };
  }

  /**
   * 取消收藏
   */
  async unsavePost(userId: string, redditId: string) {
    await this.userService.unsavePost(userId, redditId);
    return { success: true, message: 'Post unsaved' };
  }

  /**
   * 获取收藏列表
   */
  async getSavedPosts(userId: string) {
    const { items, total } = await this.userService.getSavedPosts(userId);
    return {
      savedPosts: items.map((item) => ({
        id: item.id,
        redditId: item.redditId,
        subreddit: item.subreddit,
        title: item.title,
        url: item.url,
        thumbnail: item.thumbnail || undefined,
        notes: item.notes || undefined,
        savedAt: item.savedAt,
      })),
      total,
    };
  }

  /**
   * 获取阅读历史
   */
  async getHistory(userId: string) {
    const { items, total } = await this.userService.getHistory(userId);
    return {
      history: items.map((item) => ({
        id: item.id,
        redditId: item.redditId,
        subreddit: item.subreddit,
        title: item.title,
        url: item.url,
        wordsLearned: item.wordsLearned,
        readDuration: item.readDuration || undefined,
        difficulty: item.difficulty || undefined,
        readAt: item.readAt,
      })),
      total,
    };
  }

  /**
   * 获取学习统计
   */
  async getStats(userId: string): Promise<GetStatsResDto> {
    const stats = await this.userService.getStats(userId);
    return {
      totalPostsRead: stats.totalPostsRead,
      totalWordsLearned: stats.totalWordsLearned,
      totalReadTime: stats.totalReadTime,
      averageWordsPerPost:
        stats.totalPostsRead > 0
          ? Math.round(stats.totalWordsLearned / stats.totalPostsRead)
          : 0,
      updatedAt: stats.updatedAt,
    };
  }

  /**
   * 转换 Reddit 帖子数据格式
   */
  private transformPost(post: RedditPost): RedditPostDto {
    const content = post.selftext || '';
    const difficulty = this.analyzeService.analyzeDifficulty(content);

    return {
      id: post.id,
      title: post.title,
      content: content.substring(0, 500), // 摘要
      author: post.author,
      subreddit: post.subreddit,
      score: post.score,
      commentCount: post.num_comments,
      createdAt: new Date(post.created_utc * 1000),
      url: `https://reddit.com${post.permalink}`,
      permalink: post.permalink,
      thumbnail:
        post.thumbnail && post.thumbnail.startsWith('http')
          ? post.thumbnail
          : undefined,
      isSelf: post.is_self,
      difficulty,
    };
  }

  /**
   * 处理评论数据（递归）
   */
  private processComment(comment: RedditComment): CommentDto {
    const replies: CommentDto[] = [];

    if (comment.replies && typeof comment.replies !== 'string') {
      const replyComments = comment.replies.data.children
        .filter((child) => child.kind === 't1')
        .map((child) => this.processComment(child.data as RedditComment));
      replies.push(...replyComments);
    }

    return {
      id: comment.id,
      author: comment.author,
      content: comment.body,
      score: comment.score,
      createdAt: new Date(comment.created_utc * 1000),
      depth: comment.depth,
      replies,
    };
  }
}
