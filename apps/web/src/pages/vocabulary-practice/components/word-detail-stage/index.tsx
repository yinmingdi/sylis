import React, { useState } from 'react';
import { AiOutlineSound, AiOutlineArrowRight, AiOutlineDown, AiOutlineUp } from 'react-icons/ai';

import styles from './index.module.less';
import type { DailyPlanWord } from '../../../../network/learning';

interface WordDetailStageProps {
  currentWord: DailyPlanWord;
  currentVoice: 'us' | 'uk';
  hasNextWord: boolean;
  onPlayPronunciation: () => void;
  onVoiceToggle: () => void;
  onNextWord: () => void;
}

const WordDetailStage: React.FC<WordDetailStageProps> = ({
  currentWord,
  currentVoice,
  hasNextWord,
  onPlayPronunciation,
  onVoiceToggle,
  onNextWord,
}) => {
  const phonetic = currentVoice === 'us' ? currentWord.usPhonetic : currentWord.ukPhonetic;
  const primaryMeaning = currentWord.meanings[0];


  // Tab状态管理
  const [activeTab, setActiveTab] = useState<'definition' | 'examples'>('definition');

  // 判断是否需要展开/收起功能
  const hasMultipleMeanings = currentWord.meanings.length > 1;
  const hasMultipleExamples = currentWord.exampleSentences.length > 3;

  // 获取显示的释义和例句（保留展开/收起逻辑）
  const [isMeaningsExpanded, setIsMeaningsExpanded] = useState(false);
  const [isExamplesExpanded, setIsExamplesExpanded] = useState(false);

  const displayedMeanings = hasMultipleMeanings && !isMeaningsExpanded
    ? currentWord.meanings.slice(1, 3) // 显示前2个额外释义
    : currentWord.meanings.slice(1); // 显示所有额外释义

  const displayedExamples = hasMultipleExamples && !isExamplesExpanded
    ? currentWord.exampleSentences.slice(0, 3) // 显示前3个例句
    : currentWord.exampleSentences; // 显示所有例句

  return (
    <div className={styles.detailContainer}>
      {/* 单词信息卡片 */}
      <div className={styles.wordInfoCard}>
        <div className={styles.wordHeader}>
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
            <span className={styles.phoneticText}>{phonetic}</span>
          </div>
          <div className={styles.wordMeta}>
            <span className={styles.partOfSpeech}>{primaryMeaning?.partOfSpeech}</span>
          </div>
        </div>
      </div>

      {/* 释义和例句Tab卡片 */}
      <div className={styles.contentCard}>
        {/* Tab导航 */}
        <div className={styles.tabNav}>
          <div
            className={`${styles.tabItem} ${activeTab === 'definition' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('definition')}
          >
            <span className={styles.tabText}>释义</span>
            {hasMultipleMeanings && (
              <span className={styles.tabCount}>{currentWord.meanings.length}</span>
            )}
          </div>
          <div
            className={`${styles.tabItem} ${activeTab === 'examples' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('examples')}
          >
            <span className={styles.tabText}>例句</span>
            <span className={styles.tabCount}>{currentWord.exampleSentences.length}</span>
          </div>
        </div>

        {/* Tab内容 */}
        <div className={styles.tabContent}>
          {activeTab === 'definition' && (
            <div className={styles.definitionContent}>
              <div className={styles.primaryDefinition}>
                <div className={styles.definition}>{primaryMeaning?.meaningEn}</div>
                <div className={styles.chineseDefinition}>{primaryMeaning?.meaningCn}</div>
              </div>
              {hasMultipleMeanings && (
                <div className={styles.additionalMeanings}>
                  {displayedMeanings.map((meaning) => (
                    <div key={meaning.id} className={styles.meaningItem}>
                      <span className={styles.meaningPartOfSpeech}>{meaning.partOfSpeech}</span>
                      <span className={styles.meaningText}>{meaning.meaningCn}</span>
                    </div>
                  ))}
                  {hasMultipleMeanings && currentWord.meanings.length > 3 && (
                    <div
                      className={styles.expandButton}
                      onClick={() => setIsMeaningsExpanded(!isMeaningsExpanded)}
                    >
                      <span className={styles.expandText}>
                        {isMeaningsExpanded ? '收起' : `显示更多 (${currentWord.meanings.length - 3}条)`}
                      </span>
                      {isMeaningsExpanded ? (
                        <AiOutlineUp className={styles.expandIcon} />
                      ) : (
                        <AiOutlineDown className={styles.expandIcon} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'examples' && (
            <div className={styles.examplesContent}>
              <div className={styles.examplesList}>
                {displayedExamples.map((example) => (
                  <div key={example.id} className={styles.exampleItem}>
                    <div className={styles.exampleSentence}>{example.sentenceEn}</div>
                    <div className={styles.exampleTranslation}>{example.sentenceCn}</div>
                  </div>
                ))}
              </div>
              {hasMultipleExamples && (
                <div
                  className={styles.expandButton}
                  onClick={() => setIsExamplesExpanded(!isExamplesExpanded)}
                >
                  <span className={styles.expandText}>
                    {isExamplesExpanded ? '收起' : `显示更多 (${currentWord.exampleSentences.length - 3}条)`}
                  </span>
                  {isExamplesExpanded ? (
                    <AiOutlineUp className={styles.expandIcon} />
                  ) : (
                    <AiOutlineDown className={styles.expandIcon} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 下一词按钮 */}
      {hasNextWord && (
        <div className={styles.nextWordSection}>
          <div
            className={styles.nextWordButton}
            onClick={onNextWord}
          >
            <span>下一词</span>
            <AiOutlineArrowRight className={styles.nextArrow} />
          </div>
        </div>
      )}
    </div>
  );
};

export default WordDetailStage;
