import React from 'react';

import { UnderlineActions } from '../index';
import styles from './index.module.less';

// 定义单词数据结构
export interface WordQuizRecallData {
  headword: string;
  usPhonetic?: string;
  ukPhonetic?: string;
}

export interface WordMeaning {
  partOfSpeech: string;
  meaningCn: string;
}

export type RecallAnswer = 'known' | 'vague' | 'unknown';

interface WordQuizRecallProps {
  word: WordQuizRecallData;
  currentVoice: 'us' | 'uk';
  meanings: Array<WordMeaning>;
  showHint: boolean;
  onPlayPronunciation: () => void;
  onToggleHint: () => void;
  onKnowWord: (answer: RecallAnswer) => void;
}

const WordQuizRecall: React.FC<WordQuizRecallProps> = ({
  meanings,
  showHint,
  onToggleHint,
  onKnowWord,
}) => {
  // 测验模式：只显示第一条释义
  const firstMeaning = meanings.length > 0 ? meanings[0] : null;

  const actions = [
    {
      label: '不认识',
      onClick: () => onKnowWord('unknown'),
      underlineColor: '#ff9f1c', // 橙色
    },
    {
      label: '模糊',
      onClick: () => onKnowWord('vague'),
      underlineColor: '#ffd60a', // 黄色
    },
    {
      label: '认识',
      onClick: () => onKnowWord('known'),
      underlineColor: '#06d6a0', // 绿色
    },
  ];

  return (
    <div className={styles.recallContainer}>
      {/* 主要单词卡片 */}
      <div className={styles.mainWordCard}>
        {/* 显示词性和释义（只显示第一条） */}
        {firstMeaning && (
          <div className={styles.meaningSection}>
            <div className={styles.meaningItem}>
              <span className={styles.partOfSpeech}>
                {firstMeaning.partOfSpeech}.
              </span>
              <span className={styles.meaningText}>{firstMeaning.meaningCn}</span>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作区域 */}
      <div className={styles.bottomActionsContainer}>
        {/* 提示按钮 */}
        {!showHint && (
          <div className={styles.hintSection}>
            <div className={styles.hintButton} onClick={onToggleHint}>
              <span className={styles.hintText}>瞬间想起单词，选认识</span>
              <span className={styles.hintText}>思考后想起单词，选模糊</span>
            </div>
          </div>
        )}

        {/* 认识/模糊/不认识按钮 */}
        <UnderlineActions actions={actions} />
      </div>
    </div>
  );
};

export default WordQuizRecall;

