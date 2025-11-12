import { show } from '@ebay/nice-modal-react';
import React, { useCallback } from 'react';

import { translateText } from '../../modules/vocabulary/api';
import { GrammarAnalysisModal } from '../grammar-analysis';
import { Sentence } from './components/Sentence';
import { useParseContent } from './hooks/useParseContent';
import { useSentenceTranslation } from './hooks/useSentenceTranslation';
import styles from './index.module.less';
import type {
  ITFeatures,
  ITParagraph,
  ITSentenceState,
  ITToken,
  ITWord,
} from './types';

export interface InteractiveTextProps {
  // 内容相关
  content: string | ITParagraph[];
  className?: string;

  // 单词配置
  words?: ITWord[];

  // 功能配置
  features?: ITFeatures;

  // 翻译相关（可选，默认使用内置翻译API）
  onTranslate?: (
    sentenceText: string,
    paragraphIndex: number,
    sentenceIndex: number,
  ) => Promise<string>;

  // 语法解析相关（可选，默认使用内置语法解析Modal）
  onGrammarAnalysis?: (
    sentenceText: string,
    paragraphIndex: number,
    sentenceIndex: number,
  ) => void;

  // 单词点击回调
  onWordClick?: (word: string, original: string) => void;

  // 自定义 Token 渲染
  renderToken?: (token: ITToken, index: number, paragraphIndex?: number, sentenceIndex?: number) => React.ReactNode;

  // 样式定制
  wordClassName?: string;
  highlightedWordClassName?: string;
  sentenceClassName?: string;

  // UI 控制
  showActionsOnHover?: boolean; // 操作按钮是否仅在悬停时显示
}

export const InteractiveText: React.FC<InteractiveTextProps> = ({
  content,
  className,
  words = [],
  features,
  onTranslate,
  onGrammarAnalysis,
  onWordClick,
  renderToken,
  sentenceClassName,
  showActionsOnHover = false,
}) => {
  // 解析内容
  const paragraphs = useParseContent(content, words);

  // 默认翻译函数：使用内置 translateText API（参考 WordDetailModal）
  const defaultTranslate = useCallback(
    async (text: string): Promise<string> => {
      const result = await translateText(text);
      // translateText 返回 WordDetailResDto
      // 对于句子翻译，优先使用 meanings（如果存在）
      if (result.meanings && result.meanings.length > 0) {
        return result.meanings.map((m) => m.meaningCn).join('；');
      }
      // 如果没有 meanings，返回空字符串
      return '';
    },
    []
  );

  // 翻译状态管理
  const {
    translations,
    loading,
    translateSentence,
    getShowTranslation,
  } = useSentenceTranslation(
    onTranslate
      ? (text: string, paragraphIndex: number, sentenceIndex: number) =>
        onTranslate(text, paragraphIndex, sentenceIndex)
      : defaultTranslate
  );

  // 处理句子翻译
  const handleTranslate = useCallback(
    async (
      paragraphIndex: number,
      sentenceIndex: number,
      sentenceText: string,
    ) => {
      try {
        await translateSentence(paragraphIndex, sentenceIndex, sentenceText);
      } catch (error) {
        console.error('Translation failed:', error);
      }
    },
    [translateSentence]
  );

  // 处理语法解析
  const handleGrammarAnalysis = useCallback(
    (
      paragraphIndex: number,
      sentenceIndex: number,
      sentenceText: string,
    ) => {
      if (onGrammarAnalysis) {
        onGrammarAnalysis(sentenceText, paragraphIndex, sentenceIndex);
      } else {
        // 默认行为：打开语法解析 Modal（参考 WordDetailModal）
        show(GrammarAnalysisModal, {
          text: sentenceText,
          autoAnalyze: true,
          onAnalysisComplete: (result) => {
            console.log('语法分析完成:', result);
          },
        });
      }
    },
    [onGrammarAnalysis]
  );

  // 获取句子状态的 key
  const getSentenceKey = useCallback(
    (paragraphIndex: number, sentenceIndex: number): string => {
      return `${paragraphIndex}-${sentenceIndex}`;
    },
    []
  );

  // 获取句子状态
  const getSentenceState = useCallback(
    (
      paragraphIndex: number,
      sentenceIndex: number,
    ): ITSentenceState => {
      const key = getSentenceKey(paragraphIndex, sentenceIndex);
      return {
        showTranslation: getShowTranslation(paragraphIndex, sentenceIndex),
        translation: translations[key] || null,
        translationLoading: loading[key] || false,
      };
    },
    [getShowTranslation, translations, loading, getSentenceKey]
  );

  return (
    <div className={`${styles.interactiveText} ${className || ''}`}>
      {paragraphs.map((paragraph, paragraphIndex) => (
        <div key={paragraphIndex} className={styles.paragraph}>
          {paragraph.sentences.map((sentence, sentenceIndex) => (
            <Sentence
              key={sentenceIndex}
              sentence={sentence}
              sentenceIndex={sentenceIndex}
              paragraphIndex={paragraphIndex}
              state={getSentenceState(paragraphIndex, sentenceIndex)}
              features={features}
              onTranslate={() =>
                handleTranslate(paragraphIndex, sentenceIndex, sentence.text)
              }
              onGrammarAnalysis={() =>
                handleGrammarAnalysis(
                  paragraphIndex,
                  sentenceIndex,
                  sentence.text,
                )
              }
              onWordClick={onWordClick}
              renderToken={renderToken}
              className={sentenceClassName}
              showActionsOnHover={showActionsOnHover}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default InteractiveText;
