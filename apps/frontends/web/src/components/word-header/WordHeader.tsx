import type React from 'react';

import { SoundButton } from '../index';
import styles from './index.module.less';

// 单词释义数据结构
export interface WordMeaning {
  partOfSpeech: string;
  meaningCn: string;
  meaningEn?: string;
}

// 单词头部数据结构
export interface WordHeaderData {
  headword: string;
  usPhonetic?: string;
  ukPhonetic?: string;
  examTags?: string[];
  meanings?: WordMeaning[];
}

interface WordHeaderProps {
  data: WordHeaderData;
  currentVoice?: 'us' | 'uk';
  onPlayAudio?: () => void;
  style?: React.CSSProperties;
  className?: string;
  requiredCorrectCount?: number;
  correctCount?: number;
}

const WordHeader: React.FC<WordHeaderProps> = ({
  data,
  currentVoice = 'us',
  onPlayAudio,
  style,
  className,
  requiredCorrectCount,
  correctCount = 0,
}) => {
  const phonetic =
    (currentVoice === 'us' ? data.usPhonetic : data.ukPhonetic) ||
    data.usPhonetic ||
    data.ukPhonetic;

  const renderExamTags = () => {
    if (!data.examTags || data.examTags.length === 0) return null;

    return (
      <div className={styles.examTags}>
        {data.examTags.map((tag, index) => (
          <span key={index} className={styles.examTag}>
            {tag}
          </span>
        ))}
      </div>
    );
  };

  const renderMeanings = () => {
    if (!data.meanings || data.meanings.length === 0) return null;

    // 按词性分组，获取所有词性和解释
    const groupedMeanings = data.meanings.reduce(
      (acc, meaning) => {
        if (!acc[meaning.partOfSpeech]) {
          acc[meaning.partOfSpeech] = [];
        }
        acc[meaning.partOfSpeech].push(meaning);
        return acc;
      },
      {} as Record<string, typeof data.meanings>,
    );

    return (
      <div className={styles.meanings}>
        {Object.entries(groupedMeanings).map(([partOfSpeech, meanings]) => (
          <div key={partOfSpeech} className={styles.meaningItem}>
            {partOfSpeech && partOfSpeech !== 'unknown' && (
              <span className={styles.partOfSpeech}>{partOfSpeech}.</span>
            )}
            <span className={styles.meaningText}>
              {meanings.map((m, idx) => (
                <span key={idx}>
                  {m.meaningCn}
                  {idx < meanings.length - 1 && ', '}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`${styles.wordInfo} ${className || ''}`} style={style}>
      {/* Word title with pronunciation audio */}
      <div className={styles.wordTitleRow}>
        <div className={styles.wordContainer}>
          <h2 className={styles.word}>{data.headword}</h2>
          {requiredCorrectCount !== undefined && requiredCorrectCount > 0 && (
            <div className={styles.progressDots}>
              {Array.from({ length: requiredCorrectCount }).map((_, index) => (
                <div
                  key={index}
                  className={`${styles.progressDot} ${
                    index < correctCount ? styles.completed : ''
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        <div className={styles.actionButtons}>
          <SoundButton
            word={data.headword}
            type={currentVoice === 'uk' ? 1 : 2}
            size="medium"
            onClick={onPlayAudio}
          />
        </div>
      </div>

      {/* Phonetic */}
      {phonetic && <div className={styles.phonetic}>/{phonetic}/</div>}

      {/* Exam Tags */}
      {renderExamTags()}

      {/* Meanings */}
      {data.meanings && data.meanings.length > 0 && renderMeanings()}
    </div>
  );
};

export default WordHeader;
