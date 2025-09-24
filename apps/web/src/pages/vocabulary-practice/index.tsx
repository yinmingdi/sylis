import React from 'react';
import { useSearchParams } from 'react-router-dom';

import LearningComplete from './components/learning-complete';
import LoadingError from './components/loading-error';
import WordDetailStage from './components/word-detail-stage';
import WordLearningStage from './components/word-learning-stage';
import WordPracticeHeader from './components/word-practice-header';
import { useVocabularyPractice, LearningStage } from './hooks';
import styles from './index.module.less';

const WordLearningPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';

  // 调试信息
  console.log('Vocabulary Practice - bookId:', bookId);

  const {
    currentWord,
    learningStage,
    isFavorited,
    showHint,
    currentVoice,
    loading,
    error,
    progress,
    handlePreviousWord,
    handleToggleFavorite,
    handleMarkAsFamiliar,
    handleKnowWord,
    handleNextWordFromDetail,
    handleToggleHint,
    handleVoiceToggle,
    playWordPronunciation,
    handleBackToWords,
    hasPreviousWord,
    hasNextWord,
  } = useVocabularyPractice({
    bookId,
  });

  // 渲染主要内容
  const renderMainContent = () => {
    // 如果是完成阶段，显示完成页面
    if (learningStage === LearningStage.COMPLETE) {
      return (
        <LearningComplete
          completedCount={progress.completed}
          onBackToWords={handleBackToWords}
        />
      );
    }

    if (!currentWord) return null;

    switch (learningStage) {
      case LearningStage.RECITE:
        return (
          <WordLearningStage
            currentWord={currentWord}
            showHint={showHint}
            currentVoice={currentVoice}
            onPlayPronunciation={() => playWordPronunciation()}
            onVoiceToggle={handleVoiceToggle}
            onToggleHint={handleToggleHint}
            onKnowWord={handleKnowWord}
          />
        );
      case LearningStage.DETAIL:
        return (
          <WordDetailStage
            currentWord={currentWord}
            currentVoice={currentVoice}
            hasNextWord={hasNextWord}
            onPlayPronunciation={() => playWordPronunciation()}
            onVoiceToggle={handleVoiceToggle}
            onNextWord={handleNextWordFromDetail}
          />
        );
      default:
        return (
          <WordLearningStage
            currentWord={currentWord}
            showHint={showHint}
            currentVoice={currentVoice}
            onPlayPronunciation={() => playWordPronunciation()}
            onVoiceToggle={handleVoiceToggle}
            onToggleHint={handleToggleHint}
            onKnowWord={handleKnowWord}
          />
        );
    }
  };

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
    <div className={styles.wordLearningPage}>
      {/* 加载和错误状态 */}
      <LoadingError
        loading={loading}
        error={error}
        onRetry={() => window.location.reload()}
      />

      {/* 页面头部 */}
      {!loading && !error && learningStage !== LearningStage.COMPLETE && currentWord && (
        <WordPracticeHeader
          progress={progress}
          isFavorited={isFavorited}
          hasPreviousWord={hasPreviousWord}
          onBack={() => window.history.back()}
          onPreviousWord={handlePreviousWord}
          onToggleFavorite={handleToggleFavorite}
          onMarkAsFamiliar={handleMarkAsFamiliar}
        />
      )}

      {/* 主要内容 */}
      <div className={styles.content}>
        {renderMainContent()}
      </div>
    </div>
  );
};

export default WordLearningPage;
