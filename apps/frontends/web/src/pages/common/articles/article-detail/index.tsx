import { Card, Toast, Divider } from 'antd-mobile';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AiOutlineEdit, AiOutlineShareAlt } from 'react-icons/ai';
import { useNavigate, useParams } from 'react-router-dom';

import ArticleDetailSkeleton from './ArticleDetailSkeleton';
import styles from './index.module.less';
import { AppBar } from '../../../../components/app-bar';
import { InteractiveText } from '../../../../components/interactive-text/InteractiveText';
import { PageView } from '../../../../components/view';
import { getArticleById } from '../../../../modules/articles/api';
import ArticleHeader from '../components/article-header';

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

const ArticleDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  // 获取文章详情
  const fetchArticle = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const result = await getArticleById(id);
      setArticle(result.data);
    } catch (error: any) {
      console.error('获取文章详情失败:', error);
      Toast.show({
        content: '获取文章详情失败',
        icon: 'fail',
      });
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  // 在填空测试中打开
  const handleOpenInCloze = useCallback(() => {
    if (article) {
      navigate(`/cloze-reading/${article.id}`);
    }
  }, [article, navigate]);

  // 分享功能
  const handleShare = useCallback(() => {
    // TODO: 实现分享功能
    Toast.show({
      content: '分享功能开发中',
      icon: 'success',
    });
  }, []);

  // 将 usedWords 转换为 ITWord 格式
  const words = useMemo(() => {
    return (
      article?.usedWords?.map((word) => ({
        word: word.toLowerCase(),
        highlight: true,
      })) || []
    );
  }, [article?.usedWords]);

  // PageHeader actions 配置
  const headerActions = [
    {
      icon: <AiOutlineEdit />,
      onClick: handleOpenInCloze,
      key: 'edit',
    },
    {
      icon: <AiOutlineShareAlt />,
      onClick: handleShare,
      key: 'share',
    },
  ];

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  if (loading) {
    return (
      <PageView
        className={styles.articleDetailPage}
        appBar={
          <AppBar
            title="文章详情"
            onBack={() => navigate(-1)}
            automaticallyImplyLeading={true}
            className={styles.pageHeader}
          />
        }
      >
        <ArticleDetailSkeleton />
      </PageView>
    );
  }

  if (!article) {
    return (
      <PageView
        className={styles.articleDetailPage}
        appBar={
          <AppBar
            title="文章详情"
            onBack={() => navigate(-1)}
            automaticallyImplyLeading={true}
            className={styles.pageHeader}
          />
        }
      >
        <div className={styles.errorContainer}>
          <p>文章不存在</p>
        </div>
      </PageView>
    );
  }

  return (
    <PageView
      className={styles.articleDetailPage}
      appBar={
        <AppBar
          title="文章详情"
          onBack={() => navigate(-1)}
          automaticallyImplyLeading={true}
          className={styles.pageHeader}
          actions={headerActions}
        />
      }
    >
      <div className={styles.pageContent}>
        {/* 文章内容 */}
        <Card className={styles.articleContentCard}>
          <ArticleHeader
            title={article.title}
            wordCount={article.wordCount}
            difficulty={article.difficulty}
            articleType={article.articleType}
            length={article.length}
            usedWords={article.usedWords}
            createdAt={article.createdAt}
            showWords={true}
          />

          <Divider />

          <div className={styles.articleText}>
            <InteractiveText
              content={article.content}
              words={words}
              features={{
                translation: true,
                grammarAnalysis: true,
              }}
            />
          </div>
        </Card>
      </div>
    </PageView>
  );
};

export default ArticleDetailPage;
