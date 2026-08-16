import { Empty } from 'antd-mobile';
import { List, type RowComponentProps } from 'react-window';

import styles from './index.module.less';

export interface WordItem {
  id: string;
  headword: string;
  partOfSpeech?: string;
  translation: string;
}

interface SearchListProps {
  items: WordItem[];
  onItemClick?: (item: WordItem) => void;
  height?: number | string;
  itemHeight?: number;
}

const RowComponent = ({
  index,
  style,
  items,
  onItemClick,
}: RowComponentProps<{
  items: WordItem[];
  onItemClick?: (item: WordItem) => void;
}>) => {
  const item = items[index];
  const posAndTranslation = item.partOfSpeech
    ? `${item.partOfSpeech} ${item.translation}`
    : item.translation;

  return (
    <div
      className={styles.wordItem}
      style={style}
      onClick={() => onItemClick?.(item)}
    >
      <div className={styles.wordLeft}>
        <span className={styles.word}>{item.headword}</span>
      </div>
      <div className={styles.wordRight}>
        <span className={styles.posAndTranslation}>{posAndTranslation}</span>
      </div>
    </div>
  );
};

const SearchList = ({
  items,
  onItemClick,
  height = '100%',
  itemHeight = 64,
}: SearchListProps) => {
  if (items.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <Empty description="暂无搜索结果" />
      </div>
    );
  }

  return (
    <div className={styles.searchList}>
      <List
        rowComponent={RowComponent}
        rowCount={items.length}
        rowHeight={itemHeight}
        rowProps={{ items, onItemClick }}
        style={{ height, width: '100%' }}
      />
    </div>
  );
};

export default SearchList;
