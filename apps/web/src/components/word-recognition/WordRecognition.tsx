import React from 'react';

import { InteractiveText, SoundButton, UnderlineActions } from '../index';
import styles from './index.module.less';

// 定义单词数据结构
export interface WordData {
  headword: string;
  usPhonetic?: string;
  ukPhonetic?: string;
  exampleSentences?: Array<{
    sentenceEn: string;
    sentenceCn?: string;
  }>;
}

interface WordRecognitionProps {
  word: WordData;
  currentVoice: 'us' | 'uk';
  showHint: boolean;
  onPlayPronunciation: () => void;
  onVoiceToggle: () => void;
  onToggleHint: () => void;
  onKnowWord: (known: boolean) => void;
}

const WordRecognition: React.FC<WordRecognitionProps> = ({
  word,
  currentVoice,
  showHint,
  onPlayPronunciation,
  onVoiceToggle,
  onToggleHint,
  onKnowWord,
}) => {
  const firstExample = word.exampleSentences?.[0];

  const actions = [
    {
      label: '不认识',
      onClick: () => onKnowWord(false),
      underlineColor: '#ff9f1c', // 橙色
    },
    {
      label: '认识',
      onClick: () => onKnowWord(true),
      underlineColor: '#06d6a0', // 绿色
    },
  ];

  return (
    <div className={styles.recognitionContainer}>
      {/* 主要单词卡片 */}
      <div className={styles.mainWordCard}>
        <div className={styles.wordSection}>
          {/* 单词文本 */}
          <div className={styles.wordText} onClick={onPlayPronunciation}>
            {word.headword}
          </div>

          {/* 音标 */}
          <div className={styles.wordPronunciation}>
            <span className={styles.phoneticText}>
              /{currentVoice === 'us' ? word.usPhonetic : word.ukPhonetic}/
            </span>

            <SoundButton
              word={word.headword}
              type={currentVoice === 'uk' ? 1 : 2}
              onClick={onVoiceToggle}
            />
          </div>
        </div>
      </div>

      {/* 例句区域 */}
      {showHint && (
        <div className={styles.exampleSection}>
          <div className={styles.exampleHeader}>
            <span className={styles.exampleLabel}>例句</span>
            <SoundButton
              word={word.headword}
              type={currentVoice === 'uk' ? 1 : 2}
              size="medium"
            />
          </div>
          <div className={styles.exampleSentence}>
            <InteractiveText content={firstExample?.sentenceEn || ''} />
          </div>
        </div>
      )}

      {/* 底部操作区域 */}
      <div className={styles.bottomActionsContainer}>
        {/* 提示按钮 */}
        {!showHint && (
          <div className={styles.hintSection}>
            <div className={styles.hintButton} onClick={onToggleHint}>
              <span className={styles.hintText}>尝试会想释义</span>
              <span className={styles.hintText}>点击空白处查看提示</span>
            </div>
          </div>
        )}

        {/* 认识/不认识按钮 */}
        <UnderlineActions actions={actions} />
      </div>
    </div>
  );
};

export default WordRecognition;

