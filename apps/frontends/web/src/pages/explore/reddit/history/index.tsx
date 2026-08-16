import { Empty, NavBar } from 'antd-mobile';
import React, { useEffect, useState } from 'react';
import { AiOutlineArrowLeft, AiOutlineArrowRight } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import type { HistoryItemDto } from '@/legacy-dto';

import styles from './index.module.less';
import { getReadHistory } from '../../../../modules/reddit/api';

const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryItemDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await getReadHistory();
      setHistory(data.history);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostClick = (item: HistoryItemDto) => {
    const id = item.redditId.replace('t3_', '');
    navigate(`/reddit/post/${id}?subreddit=${item.subreddit}`);
  };

  const renderHistoryCard = (item: HistoryItemDto) => (
    <div
      key={item.id}
      className={styles.historyCard}
      onClick={() => handlePostClick(item)}
    >
      <div className={styles.cardMain}>
        <h3 className={styles.historyTitle}>{item.title}</h3>
        <div className={styles.historyMeta}>
          <span>r/{item.subreddit}</span>
          <span>{new Date(item.readAt).toLocaleDateString('zh-CN')}</span>
        </div>
        <div className={styles.statsRow}>
          {item.wordsLearned > 0 && (
            <span className={styles.statBadge}>
              📚 {item.wordsLearned} 个单词
            </span>
          )}
          {item.readDuration && (
            <span className={styles.statBadge}>
              ⏱️ {Math.round(item.readDuration / 60)} 分钟
            </span>
          )}
          {item.difficulty && (
            <span
              className={styles.difficultyBadge}
              data-level={item.difficulty}
            >
              {item.difficulty === 'beginner' && '初级'}
              {item.difficulty === 'intermediate' && '中级'}
              {item.difficulty === 'advanced' && '高级'}
            </span>
          )}
        </div>
      </div>
      <AiOutlineArrowRight className={styles.arrow} />
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return <div className={styles.loadingText}>加载中...</div>;
    }

    if (history.length === 0) {
      return (
        <div className={styles.emptyState}>
          <Empty description="暂无阅读历史" />
        </div>
      );
    }

    return (
      <div className={styles.historyList}>
        {history.map((item) => renderHistoryCard(item))}
      </div>
    );
  };

  return (
    <div className={styles.historyPage}>
      <NavBar back={<AiOutlineArrowLeft />} onBack={() => navigate(-1)}>
        阅读历史
      </NavBar>

      <div className={styles.content}>{renderContent()}</div>
    </div>
  );
};

export default HistoryPage;
