import type { DailyPlanWordDto } from '@sylis/shared/dto';
import React from 'react';

import { WordRecognition } from '../../../../../components';

interface WordLearningStageProps {
  currentWord: DailyPlanWordDto;
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
  // 将 DailyPlanWord 转换为 WordRecognition 需要的格式
  const wordData = {
    headword: currentWord.headword,
    usPhonetic: currentWord.usPhonetic || undefined,
    ukPhonetic: currentWord.ukPhonetic || undefined,
    meanings: currentWord.meanings,
    exampleSentences: currentWord.exampleSentences,
  };

  return (
    <WordRecognition
      word={wordData}
      currentVoice={currentVoice}
      showHint={showHint}
      onPlayPronunciation={onPlayPronunciation}
      onVoiceToggle={onVoiceToggle}
      onToggleHint={onToggleHint}
      onKnowWord={onKnowWord}
    />
  );
};

export default WordLearningStage;
