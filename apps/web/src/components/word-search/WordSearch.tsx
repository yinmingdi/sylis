import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SearchHistory, { addSearchHistory } from './components/search-history';
import SearchList, { type WordItem } from './components/search-list';
import styles from './index.module.less';
import { searchWords } from '../../modules/vocabulary/api';

export interface WordSearchProps {
  onWordSelect?: (word: WordItem) => void;
}

const WordSearch = NiceModal.create<WordSearchProps>(({ onWordSelect }) => {
  const modal = useModal();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<WordItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (value: string) => {
    setKeyword(value);

    if (!value.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    try {
      const results = await searchWords({ keyword: value, limit: 20 });
      setSearchResults(results);
      // 添加到搜索历史
      if (results.length > 0) {
        addSearchHistory(results[0]);
      }
    } catch (error) {
      console.error('搜索单词失败:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleWordClick = (item: WordItem) => {
    onWordSelect?.(item);
    addSearchHistory(item);
    // 跳转到单词详情页面（使用单词文本）
    navigate(`/word-detail/${item.headword}`);
    // 关闭搜索弹窗
    setTimeout(() => {
      modal.hide();
    }, 100);
  };

  const handleClear = () => {
    setKeyword('');
    setSearchResults([]);
    setIsSearching(false);
  };

  const handleClose = () => {
    modal.hide();
    // 清空搜索状态
    setKeyword('');
    setSearchResults([]);
    setIsSearching(false);
  };

  if (!modal.visible) {
    return null;
  }

  return (
    <div className={styles.wordSearch}>
      <div className={styles.header}>
        <div className={styles.searchBar}>
          <input
            type="text"
            className={styles.searchInput}
            value={keyword}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="输入中英文 | 查词、翻译、润色..."
            autoFocus
          />
          <div className={styles.searchActions}>
            {keyword && (
              <button className={styles.clearButton} onClick={handleClear}>
                ×
              </button>
            )}
            <button className={styles.cancelButton} onClick={handleClose}>
              取消
            </button>
          </div>
        </div>

      </div>

      <div className={styles.content}>
        {!isSearching && !keyword ? (
          <SearchHistory onItemClick={handleWordClick} />
        ) : (
          <SearchList
            items={searchResults}
            onItemClick={handleWordClick}
          />
        )}
      </div>
    </div>
  );
});

export default WordSearch;

