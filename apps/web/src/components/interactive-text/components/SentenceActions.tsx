import React from 'react';
import { AiOutlineOpenAI, AiOutlineTranslation } from 'react-icons/ai';

import type { ITFeatures } from '../types';
import styles from './SentenceActions.module.less';

export interface SentenceActionsProps {
  sentenceText: string;
  sentenceIndex: number;
  features?: ITFeatures;
  translationLoading?: boolean;
  showTranslation?: boolean;
  onTranslate: () => void;
  onGrammarAnalysis: () => void;
  className?: string;
  showOnHover?: boolean;
}

export const SentenceActions: React.FC<SentenceActionsProps> = ({
  features,
  translationLoading = false,
  showTranslation = false,
  onTranslate,
  onGrammarAnalysis,
  className,
  showOnHover = false,
}) => {
  const hasFeatures = features?.translation || features?.grammarAnalysis;

  if (!hasFeatures) {
    return null;
  }

  return (
    <span
      className={`${styles.sentenceActions} ${showOnHover ? styles.showOnHover : ''} ${className || ''}`}
    >
      {features.translation && (
        <button
          className={`${styles.actionButton} ${showTranslation ? styles.active : ''}`}
          onClick={onTranslate}
          disabled={translationLoading}
          title="翻译句子"
          aria-label="翻译句子"
        >
          <AiOutlineTranslation className={styles.icon} />
        </button>
      )}

      {features.grammarAnalysis && (
        <button
          className={styles.actionButton}
          onClick={onGrammarAnalysis}
          title="语法解析"
          aria-label="语法解析"
        >
          <AiOutlineOpenAI className={styles.icon} />
        </button>
      )}
    </span>
  );
};

