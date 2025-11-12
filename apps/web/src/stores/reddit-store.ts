import type {
  RedditPostDto,
  SavedPostDto,
  SubredditDto,
} from '@sylis/shared/dto';
import { create } from 'zustand';

interface RedditStore {
  // 当前查看的板块
  currentSubreddit: string | null;
  setCurrentSubreddit: (subreddit: string | null) => void;

  // 订阅的板块列表
  subscribedSubreddits: SubredditDto[];
  setSubscribedSubreddits: (subreddits: SubredditDto[]) => void;
  addSubscription: (subreddit: SubredditDto) => void;
  removeSubscription: (name: string) => void;

  // 帖子列表缓存 (key: subreddit:sort, value: posts)
  postsCache: Map<string, RedditPostDto[]>;
  setPosts: (key: string, posts: RedditPostDto[]) => void;
  getPosts: (key: string) => RedditPostDto[] | undefined;
  clearPostsCache: () => void;

  // 当前帖子详情
  currentPost: RedditPostDto | null;
  setCurrentPost: (post: RedditPostDto | null) => void;

  // 收藏列表
  savedPosts: SavedPostDto[];
  setSavedPosts: (posts: SavedPostDto[]) => void;
  addSavedPost: (post: SavedPostDto) => void;
  removeSavedPost: (redditId: string) => void;

  // 学习统计
  stats: {
    totalPostsRead: number;
    totalWordsLearned: number;
    totalReadTime: number;
    averageWordsPerPost: number;
  } | null;
  setStats: (stats: {
    totalPostsRead: number;
    totalWordsLearned: number;
    totalReadTime: number;
    averageWordsPerPost: number;
  }) => void;

  // 搜索关键词
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // 分类筛选
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;

  // 难度筛选
  difficultyFilter: string;
  setDifficultyFilter: (difficulty: string) => void;
}

export const useRedditStore = create<RedditStore>((set, get) => ({
  // Initial state
  currentSubreddit: null,
  subscribedSubreddits: [],
  postsCache: new Map(),
  currentPost: null,
  savedPosts: [],
  stats: null,
  searchQuery: '',
  categoryFilter: 'all',
  difficultyFilter: '',

  // Actions
  setCurrentSubreddit: (subreddit) => set({ currentSubreddit: subreddit }),

  setSubscribedSubreddits: (subreddits) =>
    set({ subscribedSubreddits: subreddits }),

  addSubscription: (subreddit) =>
    set((state) => ({
      subscribedSubreddits: [...state.subscribedSubreddits, subreddit],
    })),

  removeSubscription: (name) =>
    set((state) => ({
      subscribedSubreddits: state.subscribedSubreddits.filter(
        (sub) => sub.name !== name,
      ),
    })),

  setPosts: (key, posts) =>
    set((state) => {
      const newCache = new Map(state.postsCache);
      newCache.set(key, posts);
      return { postsCache: newCache };
    }),

  getPosts: (key) => {
    return get().postsCache.get(key);
  },

  clearPostsCache: () => set({ postsCache: new Map() }),

  setCurrentPost: (post) => set({ currentPost: post }),

  setSavedPosts: (posts) => set({ savedPosts: posts }),

  addSavedPost: (post) =>
    set((state) => ({
      savedPosts: [post, ...state.savedPosts],
    })),

  removeSavedPost: (redditId) =>
    set((state) => ({
      savedPosts: state.savedPosts.filter((post) => post.redditId !== redditId),
    })),

  setStats: (stats) => set({ stats }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setCategoryFilter: (category) => set({ categoryFilter: category }),

  setDifficultyFilter: (difficulty) => set({ difficultyFilter: difficulty }),
}));
