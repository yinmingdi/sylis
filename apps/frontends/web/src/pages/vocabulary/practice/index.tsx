import React from 'react';
import { useSearchParams } from 'react-router-dom';

import LearningComplete from './components/learning-complete';
import LoadingError from './components/loading-error';
import WordDetailStage from './components/word-detail-stage';
import WordLearningStage from './components/word-learning-stage';
import WordPracticeHeader from './components/word-practice-header';
import WordQuizStage from './components/word-quiz-stage';
import {
  VocabularyPracticeProvider,
  useVocabularyPracticeContext,
  LearningStage,
} from './context';
import styles from './index.module.less';
import { PageView } from '../../../components/view';

// 内部组件：使用 Context
const VocabularyPracticeContent: React.FC = () => {
  const { state, actions, progress, hasPreviousWord, hasNextWord } =
    useVocabularyPracticeContext();

  // 渲染主要内容
  const renderMainContent = () => {
    // 如果是完成阶段，显示完成页面
    if (state.learningStage === LearningStage.COMPLETE) {
      return (
        <LearningComplete
          completedCount={progress.completed}
          onBackToWords={actions.backToWordList}
        />
      );
    }

    if (!state.currentWord) return null;

    switch (state.learningStage) {
      case LearningStage.RECITE:
        return (
          <WordLearningStage
            currentWord={state.currentWord}
            showHint={state.showHint}
            currentVoice={state.currentVoice}
            onPlayPronunciation={() => actions.playPronunciation()}
            onVoiceToggle={actions.toggleVoice}
            onToggleHint={actions.toggleHint}
            onKnowWord={actions.handleRecognizeWord}
          />
        );
      case LearningStage.QUIZ:
        return (
          <WordQuizStage
            currentWord={state.currentWord}
            currentVoice={state.currentVoice}
            onAnswer={actions.handleQuizAnswer}
            onPlayPronunciation={() => actions.playPronunciation()}
          />
        );
      case LearningStage.DETAIL:
        return (
          <WordDetailStage
            currentWord={state.currentWord}
            hasNextWord={hasNextWord}
            onNextWord={actions.handleMarkComplete}
          />
        );
      default:
        return (
          <WordLearningStage
            currentWord={state.currentWord}
            showHint={state.showHint}
            currentVoice={state.currentVoice}
            onPlayPronunciation={() => actions.playPronunciation()}
            onVoiceToggle={actions.toggleVoice}
            onToggleHint={actions.toggleHint}
            onKnowWord={actions.handleRecognizeWord}
          />
        );
    }
  };

  return (
    <PageView
      appBar={
        !state.loading &&
        !state.error &&
        state.learningStage !== LearningStage.COMPLETE &&
        state.currentWord ? (
          <WordPracticeHeader
            progress={progress}
            isFavorited={state.isFavorited}
            hasPreviousWord={hasPreviousWord}
            currentWord={state.currentWord}
            onBack={() => window.history.back()}
            onPreviousWord={actions.goToPreviousWord}
            onToggleFavorite={actions.toggleFavorite}
            onMarkAsFamiliar={actions.handleMarkComplete}
          />
        ) : undefined
      }
      className={styles.wordLearningPage}
    >
      {/* 加载和错误状态 */}
      <LoadingError
        loading={state.loading}
        error={state.error}
        onRetry={actions.retryLoading}
      />

      {/* 主要内容 */}
      {renderMainContent()}
    </PageView>
  );
};

// 主组件：提供 Context
const WordLearningPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const type = searchParams.get('type') as 'new' | 'review' | null;

  // 如果没有 bookId，显示提示信息
  if (!bookId) {
    return (
      <div className={styles.wordLearningPage}>
        <div className={styles.errorContainer}>
          <div className={styles.errorIcon}>📚</div>
          <div className={styles.errorTitle}>请先选择学习书籍</div>
          <div className={styles.errorMessage}>
            请返回词汇学习页面选择一本词书后再开始学习
          </div>
          <button
            className={styles.retryButton}
            onClick={() => window.history.back()}
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <VocabularyPracticeProvider bookId={bookId} type={type || undefined}>
      <VocabularyPracticeContent />
    </VocabularyPracticeProvider>
  );
};

export default WordLearningPage;
