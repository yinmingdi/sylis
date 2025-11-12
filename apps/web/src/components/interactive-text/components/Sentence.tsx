import { DotLoading } from 'antd-mobile';
import React from 'react';

import type {
  ITFeatures,
  ITSentence,
  ITSentenceState,
  ITToken,
} from '../types';
import { renderDefaultToken } from './renderDefaultToken';
import styles from './Sentence.module.less';
import { SentenceActions } from './SentenceActions';

export interface SentenceProps {
  sentence: ITSentence;
  sentenceIndex: number;
  paragraphIndex: number;
  state: ITSentenceState;
  features?: ITFeatures;
  onTranslate: () => void;
  onGrammarAnalysis: () => void;
  onWordClick?: (word: string, original: string) => void;
  renderToken?: (token: ITToken, index: number, paragraphIndex?: number, sentenceIndex?: number) => React.ReactNode;
  className?: string;
  showActionsOnHover?: boolean;
}

export const Sentence: React.FC<SentenceProps> = ({
  sentence,
  sentenceIndex,
  paragraphIndex,
  state,
  features,
  onTranslate,
  onGrammarAnalysis,
  onWordClick,
  renderToken,
  className,
  showActionsOnHover = false,
}) => {
  const tokenRenderer = (token: ITToken, index: number) => {
    if (renderToken) {
      const customRender = renderToken(token, index, paragraphIndex, sentenceIndex);
      // 如果自定义渲染返回了内容，使用它；否则使用默认渲染
      if (customRender !== null && customRender !== undefined) {
        return customRender;
      }
    }
    return renderDefaultToken(token, index, onWordClick);
  };

  return (
    <div className={`${styles.sentence} ${className || ''}`}>
      <p className={styles.sentenceContent}>
        <span className={styles.text}>
          {sentence.tokens.map((token, tokenIndex) =>
            tokenRenderer(token, tokenIndex)
          )}
          {/* 句子操作按钮 */}
          <SentenceActions
            sentenceText={sentence.text}
            sentenceIndex={sentenceIndex}
            features={features}
            translationLoading={state.translationLoading}
            showTranslation={state.showTranslation}
            onTranslate={onTranslate}
            onGrammarAnalysis={onGrammarAnalysis}
            showOnHover={showActionsOnHover}
          />
        </span>

      </p>

      {/* 翻译内容 */}
      {(state.showTranslation || state.translationLoading) && (
        <div className={styles.translation}>
          {state.translationLoading ? (
            <DotLoading color="primary" />
          ) : (
            state.translation
          )}
        </div>
      )}
    </div>
  );
};

