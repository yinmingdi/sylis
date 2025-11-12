import { SearchBar as AntdSearchBar } from 'antd-mobile';

import styles from './index.module.less';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

const SearchBar = ({
  value,
  onChange,
  onCancel,
  placeholder = '输入中英文 | 查词、翻译、润色...'
}: SearchBarProps) => {
  return (
    <div className={styles.searchBar}>
      <div className={styles.searchInputWrapper}>
        <AntdSearchBar
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          clearable
          className={styles.searchInput}
        />
      </div>
      <button className={styles.cancelButton} onClick={onCancel}>
        取消
      </button>
    </div>
  );
};

export default SearchBar;
