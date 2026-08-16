import React, { useMemo } from 'react';

import type { DailyPlanWordDto } from '@/legacy-dto';

import { WordQuizChoice, WordQuizRecall } from '../../../../../components';
import { useVocabularyPracticeContext, type QuizType } from '../../context';

interface WordQuizStageProps {
  currentWord: DailyPlanWordDto;
  currentVoice: 'us' | 'uk';
  onAnswer: (isCorrect: boolean, selectedWordId?: string) => void;
  onPlayPronunciation: () => void;
}

const WordQuizStage: React.FC<WordQuizStageProps> = ({
  currentWord,
  currentVoice,
  onAnswer,
  onPlayPronunciation,
}) => {
  const { state, actions } = useVocabularyPracticeContext();

  // ⭐️ 根据 wordQuizTypes 确定当前单词的题型
  const quizType = useMemo<QuizType>(() => {
    const type = state.wordQuizTypes.get(currentWord.id);
    // 如果没有分配题型，默认使用 choice（选择题）
    // 但如果单词没有 quizChoice 数据，则使用 recall
    if (!type) {
      return currentWord.quizChoice ? 'choice' : 'recall';
    }
    return type;
  }, [currentWord.id, currentWord.quizChoice, state.wordQuizTypes]);

  const handleAnswer = (
    selectedWordId: string,
    isCorrect: boolean,
    isCheated?: boolean,
  ) => {
    // 传递给父组件（答对或作弊视为正确，答错视为错误）
    onAnswer(isCorrect && !isCheated, selectedWordId);
  };

  const handleKnowWord = (answer: 'known' | 'vague' | 'unknown') => {
    // WordQuizRecall 模式：
    // known -> true (认识)
    // vague -> true (模糊，但算作认识)
    // unknown -> false (不认识)
    onAnswer(answer !== 'unknown');
  };

  // 选择题模式
  if (quizType === 'choice') {
    const wordInfo = {
      id: currentWord.id,
      headword: currentWord.headword,
      usPhonetic: currentWord.usPhonetic || undefined,
      ukPhonetic: currentWord.ukPhonetic || undefined,
    };

    const quizData = currentWord.quizChoice;

    return (
      <WordQuizChoice
        key={currentWord.id}
        word={wordInfo}
        quizData={quizData!}
        currentVoice={currentVoice}
        onAnswer={handleAnswer}
        onPlayPronunciation={onPlayPronunciation}
        showActions={true}
      />
    );
  }

  // 单词回忆模式（显示词性和释义）
  const wordData = {
    headword: currentWord.headword,
    usPhonetic: currentWord.usPhonetic || undefined,
    ukPhonetic: currentWord.ukPhonetic || undefined,
  };

  return (
    <WordQuizRecall
      word={wordData}
      currentVoice={currentVoice}
      meanings={currentWord.meanings || []}
      showHint={state.showHint}
      onPlayPronunciation={onPlayPronunciation}
      onToggleHint={actions.toggleHint}
      onKnowWord={handleKnowWord}
    />
  );
};

export default WordQuizStage;
