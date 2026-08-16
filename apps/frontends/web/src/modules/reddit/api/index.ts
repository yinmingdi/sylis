import {
  apiClient,
  ReadingActivityKind,
  type ReadingHistoryItemView,
  type ReadingCollectionItemView,
} from '@sylis/api-client/user';

import type {
  GetCommentsResDto,
  GetHistoryResDto,
  GetPostDetailResDto,
  GetPostsResDto,
  GetRecommendedSubredditsResDto,
  GetSavedPostsResDto,
  GetStatsResDto,
  GetUserSubscriptionsResDto,
  HistoryItemDto,
  MarkReadReqDto,
  MarkReadResDto,
  RedditPostDto,
  SavePostReqDto,
  SavePostResDto,
  SavedPostDto,
  SearchPostsResDto,
  SubredditDto,
  SubscribeReqDto,
  SubscribeResDto,
} from '@/legacy-dto';

type DataRecord = Record<string, unknown>;

const SUBSCRIPTIONS_KEY = 'sylis-legacy-reddit-subscriptions';

const asRecord = (value: unknown): DataRecord =>
  value && typeof value === 'object' ? (value as DataRecord) : {};
const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const readStorage = <T>(key: string): T[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
};

const writeStorage = <T>(key: string, value: T[]) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const normalizeRedditId = (redditId: string): string =>
  redditId.startsWith('t3_') ? redditId.slice(3) : redditId;

const legacyRedditId = (postId: string): string => `t3_${postId}`;

const readingTarget = async (redditId: string) => {
  const item = asRecord(
    await apiClient.reddit.post(normalizeRedditId(redditId)),
  );
  const document = asRecord(item.document);
  const revision = asRecord(document.currentRevision);
  const documentId = text(document.id) || text(item.documentId);
  const revisionId = text(revision.id);
  if (!documentId || !revisionId) {
    throw new Error(
      'Reddit post is not connected to a published reading revision',
    );
  }
  return {
    documentId,
    revisionId,
  };
};

const savedPostView = (
  item: ReadingCollectionItemView,
): SavedPostDto | null => {
  const metadata = item.document?.redditMetadata;
  const title = item.document?.currentRevision?.title;
  if (!metadata || !title) return null;
  return {
    id: item.id,
    redditId: legacyRedditId(metadata.postId),
    subreddit: metadata.subreddit,
    title,
    url: metadata.sourceUrl,
    thumbnail: item.thumbnailUrl ?? undefined,
    notes: item.note ?? undefined,
    savedAt: new Date(item.createdAt),
  };
};

const historyItemView = (
  item: ReadingHistoryItemView,
): HistoryItemDto | null => {
  const metadata = item.document.redditMetadata;
  const title = item.document.currentRevision?.title;
  if (!metadata || !title) return null;
  return {
    id: item.documentId,
    redditId: legacyRedditId(metadata.postId),
    subreddit: metadata.subreddit,
    title,
    url: metadata.sourceUrl,
    wordsLearned: item.learnedWordCount,
    readDuration: item.totalReadSeconds ?? undefined,
    difficulty: undefined,
    readAt: new Date(item.lastReadAt),
  };
};

const revisionFrom = (value: DataRecord) =>
  asRecord(asRecord(value.document).currentRevision);

const postView = (value: unknown): RedditPostDto => {
  const item = asRecord(value);
  const revision = revisionFrom(item);
  const sourceUrl = text(item.sourceUrl);
  return {
    id: text(item.postId) || text(item.documentId),
    title: text(revision.title, 'Untitled'),
    content: text(revision.content) || undefined,
    author: text(item.authorHash, 'Reddit user'),
    subreddit: text(item.subreddit),
    score: number(item.score),
    commentCount: number(item.commentCount),
    createdAt: new Date(
      text(item.sourceCreatedAt) ||
        text(revision.publishedAt) ||
        new Date(0).toISOString(),
    ),
    url: sourceUrl,
    permalink: sourceUrl,
    isSelf: true,
  };
};

const subredditView = (
  name: string,
  subscriptions: readonly string[],
): SubredditDto => ({
  name,
  displayName: `r/${name}`,
  description: '英语阅读内容',
  category: 'general',
  difficulty: 'intermediate',
  isSubscribed: subscriptions.includes(name),
});

const defaultSubreddits = [
  'EnglishLearning',
  'todayilearned',
  'AskReddit',
  'worldnews',
];

export const getRedditPosts = async (params: {
  subreddit: string;
  sort?: string;
  limit?: number;
  after?: string;
  timeRange?: string;
}): Promise<GetPostsResDto> => {
  const values = asArray(
    await apiClient.reddit.feed(
      params.subreddit && params.subreddit !== 'all'
        ? params.subreddit
        : undefined,
    ),
  );
  const start = Math.max(Number(params.after ?? 0) || 0, 0);
  const limit = Math.max(params.limit ?? 20, 1);
  const selected = values.slice(start, start + limit).map(postView);
  const next = start + selected.length;
  return {
    posts: selected,
    after: next < values.length ? String(next) : undefined,
    hasMore: next < values.length,
  };
};

export const getRedditPostDetail = async (
  postId: string,
  _subreddit: string,
): Promise<GetPostDetailResDto> => {
  void _subreddit;
  const post = postView(await apiClient.reddit.post(postId));
  return {
    ...post,
    fullContent: post.content ?? '',
    upvoteRatio: 0,
  };
};

export const getRedditComments = async (
  _postId: string,
  _subreddit: string,
): Promise<GetCommentsResDto> => {
  void _postId;
  void _subreddit;
  return { comments: [], totalCount: 0 };
};

export const searchRedditPosts = async (params: {
  query: string;
  subreddit?: string;
  sort?: string;
  limit?: number;
  after?: string;
}): Promise<SearchPostsResDto> => {
  const values = asArray(await apiClient.reddit.feed(params.subreddit));
  const query = params.query.trim().toLocaleLowerCase();
  const matches = values
    .map(postView)
    .filter(
      (post) =>
        post.title.toLocaleLowerCase().includes(query) ||
        post.content?.toLocaleLowerCase().includes(query),
    );
  const start = Math.max(Number(params.after ?? 0) || 0, 0);
  const limit = Math.max(params.limit ?? 20, 1);
  const posts = matches.slice(start, start + limit);
  const next = start + posts.length;
  return {
    posts,
    after: next < matches.length ? String(next) : undefined,
    hasMore: next < matches.length,
    totalCount: matches.length,
  };
};

export const getRecommendedSubreddits = async (params?: {
  category?: string;
  difficulty?: string;
}): Promise<GetRecommendedSubredditsResDto> => {
  const subscriptions = readStorage<string>(SUBSCRIPTIONS_KEY);
  const feedNames = asArray(await apiClient.reddit.feed())
    .map((item) => text(asRecord(item).subreddit))
    .filter(Boolean);
  const names = [...new Set([...feedNames, ...defaultSubreddits])];
  const subreddits = names
    .map((name) => subredditView(name, subscriptions))
    .filter(
      (subreddit) =>
        (!params?.category || subreddit.category === params.category) &&
        (!params?.difficulty || subreddit.difficulty === params.difficulty),
    );
  return { subreddits };
};

export const getUserSubscriptions =
  async (): Promise<GetUserSubscriptionsResDto> => {
    const names = readStorage<string>(SUBSCRIPTIONS_KEY);
    return { subscriptions: names.map((name) => subredditView(name, names)) };
  };

export const subscribeSubreddit = async (
  data: SubscribeReqDto,
): Promise<SubscribeResDto> => {
  const names = readStorage<string>(SUBSCRIPTIONS_KEY);
  if (!names.includes(data.subredditName)) {
    writeStorage(SUBSCRIPTIONS_KEY, [...names, data.subredditName]);
  }
  return { success: true, message: '订阅成功' };
};

export const unsubscribeSubreddit = async (
  name: string,
): Promise<SubscribeResDto> => {
  writeStorage(
    SUBSCRIPTIONS_KEY,
    readStorage<string>(SUBSCRIPTIONS_KEY).filter((item) => item !== name),
  );
  return { success: true, message: '已取消订阅' };
};

export const markPostAsRead = async (
  data: MarkReadReqDto,
): Promise<MarkReadResDto> => {
  const target = await readingTarget(data.redditId);
  await apiClient.reading.recordActivity({
    ...target,
    kind: ReadingActivityKind.COMPLETE,
    progress: 1,
    learnedWordCount: data.wordsLearned ?? 0,
    totalReadSeconds: data.readDuration,
  });
  return { success: true, message: '已记录阅读' };
};

export const savePost = async (
  data: SavePostReqDto,
): Promise<SavePostResDto> => {
  const { documentId } = await readingTarget(data.redditId);
  await apiClient.reading.save({
    documentId,
    note: data.notes,
    thumbnailUrl: data.thumbnail,
  });
  return { success: true, message: '收藏成功' };
};

export const unsavePost = async (redditId: string): Promise<SavePostResDto> => {
  const postId = normalizeRedditId(redditId);
  const saved = await apiClient.reading.library();
  const item = saved.find(
    (candidate) => candidate.document?.redditMetadata?.postId === postId,
  );
  if (!item) {
    throw new Error(`Saved Reddit post ${postId} was not found`);
  }
  await apiClient.reading.unsave(item.id);
  return { success: true, message: '已取消收藏' };
};

export const getSavedPosts = async (): Promise<GetSavedPostsResDto> => {
  const savedPosts = (await apiClient.reading.library())
    .map(savedPostView)
    .filter((item): item is SavedPostDto => item !== null);
  return { savedPosts, total: savedPosts.length };
};

export const getReadHistory = async (): Promise<GetHistoryResDto> => {
  const history = (await apiClient.reading.history())
    .map(historyItemView)
    .filter((item): item is HistoryItemDto => item !== null);
  return { history, total: history.length };
};

export const getRedditStats = async (): Promise<GetStatsResDto> => {
  const { history } = await getReadHistory();
  const totalWordsLearned = history.reduce(
    (total, item) => total + item.wordsLearned,
    0,
  );
  const totalReadTime = history.reduce(
    (total, item) => total + (item.readDuration ?? 0),
    0,
  );
  return {
    totalPostsRead: history.length,
    totalWordsLearned,
    totalReadTime,
    averageWordsPerPost:
      history.length > 0 ? Math.round(totalWordsLearned / history.length) : 0,
    updatedAt: new Date(),
  };
};
