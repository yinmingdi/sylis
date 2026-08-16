import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PostList } from '../components/post-list';
import { useRedditPosts } from '../hooks';
import styles from './index.module.less';
import { AppBar } from '../../../../components/app-bar';
import { PageView } from '../../../../components/view';

const SubredditPage: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [sort, setSort] = useState('hot');

  const { posts, loading, error, refresh } = useRedditPosts(name || '', sort);

  const handlePostClick = (postId: string) => {
    navigate(`/reddit/post/${postId}?subreddit=${name}`);
  };

  return (
    <PageView
      className={styles.subredditPage}
      bodyClassName={styles.subredditPageBody}
      appBar={
        <AppBar
          title={`r/${name}`}
          onBack={() => navigate(-1)}
          automaticallyImplyLeading={true}
        />
      }
    >
      <PostList
        posts={posts}
        loading={loading}
        error={error}
        sort={sort}
        onSortChange={setSort}
        onPostClick={handlePostClick}
        onRefresh={refresh}
        showSortBar={true}
      />
    </PageView>
  );
};

export default SubredditPage;
