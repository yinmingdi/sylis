import {
  Button,
  Space,
  Toast,
  Popup,
  Radio,
  Empty,
  Card,
} from 'antd-mobile';
import React, { useState, useEffect, useCallback } from 'react';
import {
  AiOutlineBook,
  AiOutlineFilter,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import ArticleHeader from './components/article-header';
import ArticleSkeleton from './components/article-skeleton';
import styles from './index.module.less';
import { AppBar } from '../../../components/app-bar';
import { PageView } from '../../../components/view';
import { getArticles } from '../../../modules/articles/api';

interface Article {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  theme?: string;
  articleType: 'STORY' | 'NEWS' | 'ESSAY' | 'CONVERSATION';
  length: 'SHORT' | 'MEDIUM' | 'LONG';
  usedWords?: string[];
  createdAt: string;
  updatedAt: string;
}

interface FilterOptions {
  difficulty?: string;
  theme?: string;
  articleType?: string;
  length?: string;
}

const ArticlesPage: React.FC = () => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({});

  // 获取文章列表
  const fetchArticles = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getArticles(filters);
      setArticles(result.data.articles);
    } catch (error: any) {
      console.error('获取文章列表失败:', error);
      Toast.show({
        content: '获取文章列表失败',
        icon: 'fail',
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // 查看文章详情
  const handleViewArticle = useCallback((article: Article) => {
    navigate(`/articles/${article.id}`);
  }, [navigate]);

  // 应用筛选
  const handleApplyFilter = useCallback(() => {
    setFilterVisible(false);
    fetchArticles();
  }, [fetchArticles]);

  // 重置筛选
  const handleResetFilter = useCallback(() => {
    setFilters({});
    setFilterVisible(false);
  }, []);


  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // 渲染筛选弹窗
  const renderFilterPopup = () => (
    <Popup
      visible={filterVisible}
      onMaskClick={() => setFilterVisible(false)}
      position="bottom"
      bodyStyle={{ height: '60vh' }}
    >
      <div className={styles.filterPopup}>
        <div className={styles.filterHeader}>
          <h3>筛选条件</h3>
          <Button
            size="small"
            fill="none"
            onClick={() => setFilterVisible(false)}
          >
            取消
          </Button>
        </div>

        <div className={styles.filterContent}>
          <div className={styles.filterSection}>
            <h4>难度</h4>
            <Radio.Group
              value={filters.difficulty || ''}
              onChange={(value) => setFilters(prev => ({ ...prev, difficulty: value as string || undefined }))}
            >
              <Space direction="vertical">
                <Radio value="">全部</Radio>
                <Radio value="EASY">初级</Radio>
                <Radio value="MEDIUM">中级</Radio>
                <Radio value="HARD">高级</Radio>
              </Space>
            </Radio.Group>
          </div>

          <div className={styles.filterSection}>
            <h4>文章类型</h4>
            <Radio.Group
              value={filters.articleType || ''}
              onChange={(value) => setFilters(prev => ({ ...prev, articleType: value as string || undefined }))}
            >
              <Space direction="vertical">
                <Radio value="">全部</Radio>
                <Radio value="STORY">故事</Radio>
                <Radio value="NEWS">新闻</Radio>
                <Radio value="ESSAY">议论文</Radio>
                <Radio value="CONVERSATION">对话</Radio>
              </Space>
            </Radio.Group>
          </div>

          <div className={styles.filterSection}>
            <h4>长度</h4>
            <Radio.Group
              value={filters.length || ''}
              onChange={(value) => setFilters(prev => ({ ...prev, length: value as string || undefined }))}
            >
              <Space direction="vertical">
                <Radio value="">全部</Radio>
                <Radio value="SHORT">短篇</Radio>
                <Radio value="MEDIUM">中篇</Radio>
                <Radio value="LONG">长篇</Radio>
              </Space>
            </Radio.Group>
          </div>
        </div>

        <div className={styles.filterFooter}>
          <Button
            color="default"
            onClick={handleResetFilter}
            style={{ flex: 1 }}
          >
            重置
          </Button>
          <Button
            color="primary"
            onClick={handleApplyFilter}
            style={{ flex: 1, marginLeft: 12 }}
          >
            应用
          </Button>
        </div>
      </div>
    </Popup>
  );

  // 渲染文章列表
  const renderArticleList = () => {
    if (loading) {
      return <ArticleSkeleton count={3} />;
    }

    if (articles.length === 0) {
      return (
        <div className={styles.emptyContainer}>
          <Empty
            description="暂无文章"
            image={<AiOutlineBook size={64} />}
          />
        </div>
      );
    }

    return (
      <div className={styles.articleGrid}>
        {articles.map((article, index) => (
          <Card
            key={article.id}
            className={styles.articleCard}
            onClick={() => handleViewArticle(article)}
            style={{
              animationDelay: `${index * 100}ms`,
            }}
          >
            <div className={styles.cardContent}>
              <ArticleHeader
                title={article.title}
                wordCount={article.wordCount}
                difficulty={article.difficulty}
                articleType={article.articleType}
                length={article.length}
                usedWords={article.usedWords}
                createdAt={article.createdAt}
                showWords={false}
              />
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const headerActions = [
    {
      icon: <AiOutlineFilter />,
      onClick: () => setFilterVisible(true),
      key: 'filter',
    },
  ];

  return (
    <PageView
      className={styles.articlesPage}
      appBar={
        <AppBar
          title={`我的文章 (${articles.length})`}
          onBack={() => navigate(-1)}
          automaticallyImplyLeading={true}
          actions={headerActions}
          className={styles.pageHeader}
        />
      }
    >
      <div className={styles.pageContent}>
        {renderArticleList()}
      </div>

      {renderFilterPopup()}
    </PageView>
  );
};

export default ArticlesPage;
