import type { ReactNode } from 'react';

import type { ITToken } from '../types';
import styles from './Sentence.module.less';

export const renderDefaultToken = (
  token: ITToken,
  index: number,
  onWordClick?: (word: string, original: string) => void,
): ReactNode => {
  switch (token.type) {
    case 'word': {
      if (token.hidden) {
        return (
          <span key={index} className={styles.clozeInput}>
            <input
              type="text"
              className={styles.clozeField}
              placeholder="?"
              style={{ width: `${token.original.length * 0.8 + 1}em` }}
            />
          </span>
        );
      }

      const handleClick = () => {
        const clickHandler = token.wordConfig?.onClick || onWordClick;
        clickHandler?.(token.content, token.original);
      };

      const isClickable = !!(token.wordConfig?.onClick || onWordClick);

      return (
        <span
          key={index}
          className={`${styles.word} ${token.highlighted ? styles.highlighted : ''} ${isClickable ? styles.clickable : ''}`}
          data-word={token.content}
          onClick={isClickable ? handleClick : undefined}
        >
          {token.original}
        </span>
      );
    }
    case 'punctuation':
      return (
        <span key={index} className={styles.punctuation}>
          {token.content}
        </span>
      );
    case 'space':
      return (
        <span key={index} className={styles.space}>
          {token.content}
        </span>
      );
    default:
      return null;
  }
};
