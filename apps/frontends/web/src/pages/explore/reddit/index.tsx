import { SearchBar, Toast } from 'antd-mobile';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import type { RedditPostDto } from '@/legacy-dto';

import { PostList } from './components/post-list';
import { useRedditPosts } from './hooks';
import styles from './index.module.less';
import { AppBar } from '../../../components/app-bar';
import { PageView } from '../../../components/view';
import { searchRedditPosts } from '../../../modules/reddit/api';

const RedditPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');
  const [sort, setSort] = useState('hot');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RedditPostDto[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);

  // 使用首页的帖子数据，这里可以传入'all'或者根据categoryFilter动态选择
  const { posts, loading, error, refresh } = useRedditPosts('all', sort);

  const handlePostClick = (postId: string) => {
    navigate(`/reddit/post/${postId}`);
  };

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      setSearchError(null);
      setIsSearching(true);

      const result = await searchRedditPosts({
        query: query.trim(),
        sort,
        limit: 25,
      });

      setSearchResults(result.posts);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchError(err as Error);
      Toast.show({
        content: '搜索失败，请重试',
        icon: 'fail',
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchValue(value);
    if (!value.trim()) {
      setIsSearching(false);
      setSearchResults([]);
    }
  };

  const handleSearchSubmit = (value: string) => {
    performSearch(value);
  };

  const handleRefresh = async () => {
    if (isSearching) {
      await performSearch(searchValue);
    } else {
      refresh();
    }
  };

  // 当排序改变时，如果在搜索模式，重新搜索
  useEffect(() => {
    if (isSearching && searchValue.trim()) {
      performSearch(searchValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  // 决定显示哪些帖子
  const displayPosts = isSearching ? searchResults : posts;
  const displayLoading = isSearching ? searchLoading : loading;
  const displayError = isSearching ? searchError : error;

  return (
    <PageView
      className={styles.redditPage}
      appBar={
        <AppBar
          title="Reddit"
          onBack={() => navigate(-1)}
          automaticallyImplyLeading={true}
        />
      }
    >
      {/* Search Bar */}
      <div className={styles.searchContainer}>
        <SearchBar
          placeholder="搜索帖子、话题..."
          value={searchValue}
          onChange={handleSearch}
          onSearch={handleSearchSubmit}
          onClear={() => {
            setSearchValue('');
            setIsSearching(false);
            setSearchResults([]);
          }}
        />
      </div>
      <PostList
        posts={displayPosts}
        loading={displayLoading}
        error={displayError}
        sort={sort}
        onSortChange={setSort}
        onPostClick={handlePostClick}
        onRefresh={handleRefresh}
        showSortBar={true}
        emptyText={isSearching ? '未找到相关内容' : '暂无内容'}
        errorText={isSearching ? '搜索失败，请重试' : '加载失败，请重试'}
      />
    </PageView>
  );
};

export default RedditPage;
