import React from 'react';
import { AiOutlineSound, AiOutlineInfoCircle } from 'react-icons/ai';

import styles from './index.module.less';
import type { DailyPlanWord } from '../../../../network/learning';

interface WordLearningStageProps {
  currentWord: DailyPlanWord;
  showHint: boolean;
  currentVoice: 'us' | 'uk';
  onPlayPronunciation: () => void;
  onVoiceToggle: () => void;
  onToggleHint: () => void;
  onKnowWord: (known: boolean) => void;
}

const WordLearningStage: React.FC<WordLearningStageProps> = ({
  currentWord,
  showHint,
  currentVoice,
  onPlayPronunciation,
  onVoiceToggle,
  onToggleHint,
  onKnowWord,
}) => {
  const firstExample = currentWord.exampleSentences[0];

  return (
    <div className={styles.learningContainer}>
      {/* 主要单词卡片 */}
      <div className={styles.mainWordCard}>
        <div className={styles.wordSection}>
          <div className={styles.wordText} onClick={onPlayPronunciation}>
            {currentWord.headword}
          </div>
          <div className={styles.wordPronunciation}>
            <div
              className={styles.voiceToggle}
              onClick={onVoiceToggle}
            >
              <span className={styles.voiceType}>
                {currentVoice === 'us' ? '英 ' : '美 '}
              </span>
              <AiOutlineSound className={styles.soundIcon} />
            </div>
            <span className={styles.phoneticText}>
              {currentVoice === 'us' ? currentWord.usPhonetic : currentWord.ukPhonetic}
            </span>
          </div>
        </div>

        {/* 例句区域 */}
        <div className={styles.exampleSection}>
          <div className={styles.exampleSentence}>
            {firstExample?.sentenceEn}
          </div>
          {showHint && (
            <div className={styles.exampleTranslation}>
              {firstExample?.sentenceCn}
            </div>
          )}
        </div>
      </div>

      {/* 提示按钮 */}
      <div className={styles.hintSection}>
        <div className={styles.hintButton} onClick={onToggleHint}>
          <AiOutlineInfoCircle className={styles.hintIcon} />
          <span className={styles.hintText}>提示一下</span>
        </div>
      </div>

      {/* 认识/不认识按钮 */}
      <div className={styles.actionButtonsSection}>
        <div
          className={`${styles.actionButton} ${styles.knowButton}`}
          onClick={() => onKnowWord(true)}
        >
          <span className={styles.buttonText}>认识</span>
        </div>
        <div
          className={`${styles.actionButton} ${styles.unknowButton}`}
          onClick={() => onKnowWord(false)}
        >
          <span className={styles.buttonText}>不认识</span>
        </div>
      </div>
    </div>
  );
};

export default WordLearningStage;
