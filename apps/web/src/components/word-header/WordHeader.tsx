import React, { useState } from 'react';
import { AiFillAudio } from 'react-icons/ai';

import { SoundButton, FollowReadModal } from '../index';
import type { AssessmentResult } from '../index';
import styles from './index.module.less';

// 单词释义数据结构
export interface WordMeaning {
  partOfSpeech: string;
  meaningCn: string;
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
  onFollowReadComplete?: (result: AssessmentResult) => void;
  style?: React.CSSProperties;
  className?: string;
  requiredCorrectCount?: number;
  correctCount?: number;
}

const WordHeader: React.FC<WordHeaderProps> = ({
  data,
  currentVoice = 'us',
  onPlayAudio,
  onFollowReadComplete,
  style,
  className,
  requiredCorrectCount,
  correctCount = 0,
}) => {
  const [showFollowReadModal, setShowFollowReadModal] = useState(false);
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

  const handleFollowReadComplete = (result: AssessmentResult) => {
    onFollowReadComplete?.(result);
    console.log('跟读评估结果:', result);
  };

  const renderMeanings = () => {
    if (!data.meanings || data.meanings.length === 0) return null;

    // 按词性分组，获取所有词性和解释
    const groupedMeanings = data.meanings.reduce((acc, meaning) => {
      if (!acc[meaning.partOfSpeech]) {
        acc[meaning.partOfSpeech] = [];
      }
      acc[meaning.partOfSpeech].push(meaning);
      return acc;
    }, {} as Record<string, typeof data.meanings>);

    return (
      <div className={styles.meanings}>
        {Object.entries(groupedMeanings).map(([partOfSpeech, meanings]) => (
          <div key={partOfSpeech} className={styles.meaningItem}>
            {partOfSpeech && <span className={styles.partOfSpeech}>{partOfSpeech}.</span>}
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
    <div
      className={`${styles.wordInfo} ${className || ''}`}
      style={style}
    >
      {/* Word Title with Sound and Follow Read */}
      <div className={styles.wordTitleRow}>
        <div className={styles.wordContainer}>
          <h2 className={styles.word}>{data.headword}</h2>
          {requiredCorrectCount !== undefined && requiredCorrectCount > 0 && (
            <div className={styles.progressDots}>
              {Array.from({ length: requiredCorrectCount }).map((_, index) => (
                <div
                  key={index}
                  className={`${styles.progressDot} ${index < correctCount ? styles.completed : ''
                    }`}
                />
              ))}
            </div>
          )}
        </div>
        <div className={styles.actionButtons}>
          <div
            onClick={() => setShowFollowReadModal(true)}
            className={styles.followReadButton}
          >
            <AiFillAudio />
          </div>
          <SoundButton
            word={data.headword}
            type={currentVoice === 'uk' ? 1 : 2}
            size="medium"
            onClick={onPlayAudio}
          />

        </div>
      </div>

      {/* Phonetic */}
      {(data.usPhonetic || data.ukPhonetic) && (
        <div className={styles.phonetic}>
          /{currentVoice === 'us' ? data.usPhonetic : data.ukPhonetic || data.usPhonetic}/
        </div>
      )}

      {/* Exam Tags */}
      {renderExamTags()}

      {/* Meanings */}
      {data.meanings && data.meanings.length > 0 && renderMeanings()}

      {/* Follow Read Modal */}
      <FollowReadModal
        visible={showFollowReadModal}
        onClose={() => setShowFollowReadModal(false)}
        referenceText={data.headword}
        phoneticText={currentVoice === 'us' ? data.usPhonetic : (data.ukPhonetic || data.usPhonetic)}
        showWaveform={true}
        onAssessmentComplete={handleFollowReadComplete}
      />
    </div>
  );
};

export default WordHeader;
