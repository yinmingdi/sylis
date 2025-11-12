import { Button } from 'antd-mobile';
import { useEffect, useState } from 'react';
import { AiOutlineClockCircle, AiOutlineDelete } from 'react-icons/ai';

import SearchList, { type WordItem } from '../search-list';
import styles from './index.module.less';

const STORAGE_KEY = 'word-search-history';
const MAX_HISTORY_COUNT = 20;

interface SearchHistoryProps {
  onItemClick: (item: WordItem) => void;
}

const SearchHistory = ({ onItemClick }: SearchHistoryProps) => {
  const [history, setHistory] = useState<WordItem[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  };

  const clearHistory = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setHistory([]);
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
  };

  if (history.length === 0) {
    return null;
  }

  return (
    <div className={styles.searchHistory}>
      <div className={styles.header}>
        <div className={styles.title}>
          <AiOutlineClockCircle />
          <span>搜索历史</span>
        </div>
        <Button
          size="small"
          fill="none"
          className={styles.clearButton}
          onClick={clearHistory}
        >
          <AiOutlineDelete />
          清除
        </Button>
      </div>
      <div className={styles.listContainer}>
        <SearchList
          items={history}
          onItemClick={onItemClick}
        />
      </div>
    </div>
  );
};

// 添加搜索历史的工具函数
export const addSearchHistory = (wordItem: WordItem) => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let history: WordItem[] = stored ? JSON.parse(stored) : [];

    // 移除重复项（基于单词文本）
    history = history.filter((item) => item.headword !== wordItem.headword);

    // 添加到开头
    history.unshift(wordItem);

    // 限制数量
    if (history.length > MAX_HISTORY_COUNT) {
      history = history.slice(0, MAX_HISTORY_COUNT);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to add search history:', error);
  }
};

export default SearchHistory;
