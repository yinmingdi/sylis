import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  GetPostsReqDto,
  GetRecommendedSubredditsReqDto,
  MarkReadReqDto,
  SavePostReqDto,
  SearchPostsReqDto,
  SubscribeReqDto,
} from './dto';
import { RedditService } from './reddit.service';
@ApiTags('Reddit')
@Controller('reddit')
export class RedditController {
  constructor(private readonly redditService: RedditService) {}

  @Get('posts')
  @ApiOperation({ summary: '获取板块帖子列表' })
  async getPosts(@Query() query: GetPostsReqDto) {
    return this.redditService.getPosts(query.subreddit, query.sort, {
      limit: query.limit,
      after: query.after,
      timeRange: query.timeRange,
    });
  }

  @Get('posts/:postId')
  @ApiOperation({ summary: '获取帖子详情' })
  async getPostDetail(
    @Param('postId') postId: string,
    @Query('subreddit') subreddit: string,
  ) {
    return this.redditService.getPostDetail(subreddit, postId);
  }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: '获取帖子评论' })
  async getComments(
    @Param('postId') postId: string,
    @Query('subreddit') subreddit: string,
  ) {
    return this.redditService.getComments(subreddit, postId);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索帖子' })
  async searchPosts(@Query() query: SearchPostsReqDto) {
    return this.redditService.searchPosts(query.query, {
      subreddit: query.subreddit,
      sort: query.sort,
      limit: query.limit,
      after: query.after,
    });
  }

  @Get('subreddits/recommended')
  @ApiOperation({ summary: '获取推荐板块列表' })
  async getRecommendedSubreddits(
    @Query() query: GetRecommendedSubredditsReqDto,
  ) {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.getRecommendedSubreddits(
      userId,
      query.category,
      query.difficulty,
    );
  }

  @Get('subreddits/subscribed')
  @ApiOperation({ summary: '获取用户订阅的板块' })
  async getUserSubscriptions() {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.getUserSubscriptions(userId);
  }

  @Post('subreddits/subscribe')
  @ApiOperation({ summary: '订阅板块' })
  async subscribe(@Body() body: SubscribeReqDto) {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.subscribe(userId, body.subredditName);
  }

  @Delete('subreddits/unsubscribe/:name')
  @ApiOperation({ summary: '取消订阅板块' })
  async unsubscribe(@Param('name') name: string) {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.unsubscribe(userId, name);
  }

  @Post('mark-read')
  @ApiOperation({ summary: '标记帖子为已读' })
  async markAsRead(@Body() body: MarkReadReqDto) {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.markAsRead(userId, body);
  }

  @Post('save')
  @ApiOperation({ summary: '收藏帖子' })
  async savePost(@Body() body: SavePostReqDto) {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.savePost(userId, body);
  }

  @Delete('save/:redditId')
  @ApiOperation({ summary: '取消收藏帖子' })
  async unsavePost(@Param('redditId') redditId: string) {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.unsavePost(userId, redditId);
  }

  @Get('saved')
  @ApiOperation({ summary: '获取收藏列表' })
  async getSavedPosts() {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.getSavedPosts(userId);
  }

  @Get('history')
  @ApiOperation({ summary: '获取阅读历史' })
  async getHistory() {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.getHistory(userId);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取学习统计' })
  async getStats() {
    // TODO: 从 JWT 中提取用户 ID
    const userId = 'guest';
    return this.redditService.getStats(userId);
  }
}
