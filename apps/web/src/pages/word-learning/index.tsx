import React, { useEffect, useState } from 'react';
import {
  AiOutlineHeart,
  AiOutlineRollback,
  AiFillHeart,
  AiOutlineSound,
  AiOutlineInfoCircle,
  AiOutlineArrowRight
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';

// 模拟单词数据类型
interface WordData {
  id: string;
  word: string;
  pronunciation: string;
  definition: string;
  chineseDefinition: string;
  partOfSpeech: string;
  etymology?: string;
  examples: Array<{
    sentence: string;
    translation: string;
  }>;
  imageUrl?: string;
}

// 学习阶段枚举
enum LearningStage {
  RECITE = 'recite',     // 背诵阶段
  DETAIL = 'detail',     // 详情阶段
  COMPLETE = 'complete'  // 完成阶段
}

// 模拟单词数据
const mockWords: WordData[] = [
  {
    id: '1',
    word: 'ubiquitous',
    pronunciation: '/juːˈbɪkwɪtəs/',
    definition: 'present, appearing, or found everywhere',
    chineseDefinition: '普遍存在的，无所不在的',
    partOfSpeech: '形容词',
    etymology: '来自拉丁语 ubique，意为"到处"',
    examples: [
      {
        sentence: 'Smartphones have become ubiquitous in modern society.',
        translation: '智能手机在现代社会中变得无处不在。'
      },
      {
        sentence: 'The ubiquitous presence of social media affects how we communicate.',
        translation: '社交媒体的普遍存在影响着我们的交流方式。'
      }
    ],
    imageUrl: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop'
  },
  {
    id: '2',
    word: 'serendipity',
    pronunciation: '/ˌserənˈdɪpəti/',
    definition: 'the occurrence and development of events by chance in a happy or beneficial way',
    chineseDefinition: '意外发现，偶然收获',
    partOfSpeech: '名词',
    etymology: '来自波斯童话《锡兰三王子》',
    examples: [
      {
        sentence: 'Meeting my best friend was pure serendipity.',
        translation: '遇到我最好的朋友纯属偶然。'
      },
      {
        sentence: 'The discovery was a beautiful example of serendipity in science.',
        translation: '这个发现是科学中美妙偶然性的典型例子。'
      }
    ],
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop'
  }
];



const WordLearningPage: React.FC = () => {
  const navigate = useNavigate();
  // 全量单词数组
  const [allWords] = useState<WordData[]>(mockWords);
  // 未学会的单词数组
  const [unlearnedWords, setUnlearnedWords] = useState<WordData[]>(mockWords);
  // 当前在未学会数组中的索引
  const [currentUnlearnedIndex, setCurrentUnlearnedIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState<WordData | null>(null);
  const [learningStage, setLearningStage] = useState<LearningStage>(LearningStage.RECITE);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentVoice, setCurrentVoice] = useState<'us' | 'uk'>('us');


  useEffect(() => {
    // 如果有未学会的单词且索引有效
    if (unlearnedWords.length > 0 && currentUnlearnedIndex < unlearnedWords.length) {
      const word = unlearnedWords[currentUnlearnedIndex];
      setCurrentWord(word);
      setLearningStage(LearningStage.RECITE);
      setIsFavorited(false);
      setShowHint(false);
    } else {
      // 所有单词都已学习完成
      setCurrentWord(null);
      console.log('所有单词学习完成！');
      // TODO: 显示学习完成页面或处理学习完成状态
    }
  }, [currentUnlearnedIndex, unlearnedWords]);

  // 返回上一个单词
  const handlePreviousWord = () => {
    if (currentUnlearnedIndex > 0) {
      setCurrentUnlearnedIndex(currentUnlearnedIndex - 1);
    }
  };

  // 切换收藏状态
  const handleToggleFavorite = () => {
    setIsFavorited(!isFavorited);
    // TODO: 调用API保存收藏状态
  };

  // 标记为熟悉
  const handleMarkAsFamiliar = () => {
    if (!currentWord) return;


    // 从未学会数组中移除当前单词
    setUnlearnedWords(prev => prev.filter(word => word.id !== currentWord.id));

    // TODO: 调用API保存熟悉状态

    // 延迟后自动跳转到下一个单词
    setTimeout(() => {
      // 如果当前索引超出范围，调整到最后一个有效索引
      if (currentUnlearnedIndex >= unlearnedWords.length - 1) {
        setCurrentUnlearnedIndex(Math.max(0, unlearnedWords.length - 2));
      }
      // 如果索引还在范围内，当前单词会自动更新到下一个
    }, 1000);
  };

  // 播放单词发音
  const playWordPronunciation = (voice: 'us' | 'uk' = currentVoice) => {
    if (!currentWord) return;

    // 使用 Web Speech API 播放发音
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(currentWord.word);
      utterance.lang = voice === 'us' ? 'en-US' : 'en-GB';
      utterance.rate = 0.8;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  // 切换语音类型并发音
  const handleVoiceToggle = () => {
    const newVoice = currentVoice === 'us' ? 'uk' : 'us';
    setCurrentVoice(newVoice);
    playWordPronunciation(newVoice);
  };

  // 点击提示显示/隐藏中文
  const handleToggleHint = () => {
    setShowHint(!showHint);
  };

  // 完成学习，回到words页面
  const handleBackToWords = () => {
    navigate('/words');
  };

  // 处理认识/不认识选择
  const handleKnowWord = (known: boolean) => {
    if (!currentWord) return;

    // TODO: 记录学习状态到API
    console.log(known ? '认识' : '不认识', currentWord.word);

    // 无论认识还是不认识，都进入详情页
    setLearningStage(LearningStage.DETAIL);

    // 如果不认识，标记为需要复习
    if (!known) {
      // TODO: 记录为需要复习的单词，不更新学习进度
      console.log('标记为需要复习');
    }
  };

  // 进入详情页 (暂时未使用，备用)
  // const handleShowDetail = () => {
  //     setLearningStage(LearningStage.DETAIL);
  // };

  // 在详情页进入下一个单词
  const handleNextWordFromDetail = () => {
    if (!currentWord) return;


    // 从未学会数组中移除当前单词
    const newUnlearnedWords = unlearnedWords.filter(word => word.id !== currentWord.id);
    setUnlearnedWords(newUnlearnedWords);

    // TODO: 调用API保存学习状态

    // 检查是否是最后一个单词
    if (newUnlearnedWords.length === 0) {
      // 所有单词学习完成，进入完成页面
      setLearningStage(LearningStage.COMPLETE);
    } else {
      // 调整当前索引
      if (currentUnlearnedIndex >= newUnlearnedWords.length) {
        // 如果当前索引超出新数组范围，说明已经是最后一个单词
        setCurrentUnlearnedIndex(Math.max(0, newUnlearnedWords.length - 1));
      }
      // 如果索引还在范围内，保持当前索引，这样会自动显示下一个单词
    }
  };

  // 检查是否有上一个未学习的单词
  const hasPreviousUnlearnedWord = () => {
    return currentUnlearnedIndex > 0;
  };

  // 检查是否有下一个未学习的单词
  const hasNextUnlearnedWord = () => {
    return unlearnedWords.length >= 1; // 包含当前单词，最后一个单词也显示下一词按钮
  };

  const renderPageHeader = () => {
    const learnedCount = allWords.length - unlearnedWords.length;
    const progress = `${learnedCount}/${allWords.length}`;

    const headerActions = (
      <div className={styles.headerActions}>
        <div
          className={styles.headerActionButton}
          onClick={handlePreviousWord}
          style={{ opacity: !hasPreviousUnlearnedWord() ? 0.3 : 1 }}
        >
          <AiOutlineRollback />
        </div>
        <div
          className={styles.headerActionButton}
          onClick={handleToggleFavorite}
        >
          {isFavorited ? <AiFillHeart className={styles.favorited} /> : <AiOutlineHeart />}
        </div>
        <div
          className={styles.headerActionButton}
          onClick={handleMarkAsFamiliar}
        >
          熟
        </div>
      </div>
    );

    return (
      <PageHeader
        title=""
        onBack={() => navigate(-1)}
        actions={headerActions}
      >
        <div className={styles.progressContainer}>
          {progress}
        </div>
      </PageHeader>
    );
  }





  const renderWordLeaning = () => {
    return (
      <div className={styles.learningContainer}>
        {/* 主要单词卡片 */}
        <div className={styles.mainWordCard}>
          <div className={styles.wordSection}>
            <div className={styles.wordText} onClick={() => playWordPronunciation()}>
              {currentWord?.word}
            </div>
            <div className={styles.wordPronunciation}>
              <div
                className={styles.voiceToggle}
                onClick={handleVoiceToggle}
              >
                <span className={styles.voiceType}>
                  {currentVoice === 'us' ? '英 ' : '美 '}
                </span>
                <AiOutlineSound className={styles.soundIcon} />
              </div>
              <span className={styles.phoneticText}>{currentWord?.pronunciation}</span>
            </div>
          </div>

          {/* 例句区域 */}
          <div className={styles.exampleSection}>
            <div className={styles.exampleSentence}>
              {currentWord?.examples[0].sentence}
            </div>
            {showHint && (
              <div className={styles.exampleTranslation}>
                {currentWord?.examples[0].translation}
              </div>
            )}
          </div>
        </div>

        {/* 提示按钮 */}
        <div className={styles.hintSection}>
          <div className={styles.hintButton} onClick={handleToggleHint}>
            <AiOutlineInfoCircle className={styles.hintIcon} />
            <span className={styles.hintText}>提示一下</span>
          </div>
        </div>

        {/* 认识/不认识按钮 */}
        <div className={styles.actionButtonsSection}>
          <div
            className={`${styles.actionButton} ${styles.knowButton}`}
            onClick={() => handleKnowWord(true)}
          >
            <span className={styles.buttonText}>认识</span>
          </div>
          <div
            className={`${styles.actionButton} ${styles.unknowButton}`}
            onClick={() => handleKnowWord(false)}
          >
            <span className={styles.buttonText}>不认识</span>
          </div>
        </div>
      </div>
    )
  }



  const renderWordDetail = () => {
    return (
      <div className={styles.detailContainer}>
        {/* 单词信息卡片 */}
        <div className={styles.wordInfoCard}>
          <div className={styles.wordHeader}>
            <div className={styles.wordText} onClick={() => playWordPronunciation()}>
              {currentWord?.word}
            </div>
            <div className={styles.wordPronunciation}>
              <div
                className={styles.voiceToggle}
                onClick={handleVoiceToggle}
              >
                <span className={styles.voiceType}>
                  {currentVoice === 'us' ? '英 ' : '美 '}
                </span>
                <AiOutlineSound className={styles.soundIcon} />
              </div>
              <span className={styles.phoneticText}>{currentWord?.pronunciation}</span>
            </div>
            <div className={styles.wordMeta}>
              <span className={styles.partOfSpeech}>{currentWord?.partOfSpeech}</span>
            </div>
          </div>
        </div>

        {/* 释义卡片 */}
        <div className={styles.definitionCard}>
          <div className={styles.cardTitle}>释义</div>
          <div className={styles.definition}>{currentWord?.definition}</div>
          <div className={styles.chineseDefinition}>{currentWord?.chineseDefinition}</div>
          {currentWord?.etymology && (
            <div className={styles.etymology}>
              <div className={styles.etymologyLabel}>词源</div>
              <div className={styles.etymologyText}>{currentWord.etymology}</div>
            </div>
          )}
        </div>

        {/* 例句卡片 */}
        <div className={styles.examplesCard}>
          <div className={styles.cardTitle}>例句</div>
          <div className={styles.examplesList}>
            {currentWord?.examples.map((example, index) => (
              <div key={index} className={styles.exampleItem}>
                <div className={styles.exampleSentence}>{example.sentence}</div>
                <div className={styles.exampleTranslation}>{example.translation}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 下一词按钮 */}
        {hasNextUnlearnedWord() && (
          <div className={styles.nextWordSection}>
            <div
              className={styles.nextWordButton}
              onClick={handleNextWordFromDetail}
            >
              <span>下一词</span>
              <AiOutlineArrowRight className={styles.nextArrow} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // 完成提示页面
  const renderCompleteScreen = () => {
    const learnedCount = allWords.length;

    return (
      <div className={styles.completeContainer}>
        <div className={styles.completeContent}>
          <div className={styles.completeIcon}>🎉</div>
          <div className={styles.completeTitle}>恭喜你！</div>
          <div className={styles.completeSubtitle}>今日学习已完成</div>
          <div className={styles.completeStats}>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{learnedCount}</div>
              <div className={styles.statLabel}>已学词汇</div>
            </div>
          </div>
          <div className={styles.completeMessage}>
            坚持每天学习，你的英语水平会不断提升！
          </div>
          <div className={styles.completeActions}>
            <div
              className={styles.completeButton}
              onClick={handleBackToWords}
            >
              完成
            </div>
          </div>
        </div>
      </div>
    )
  }


  const renderMainContent = () => {
    // 如果是完成阶段，显示完成页面
    if (learningStage === LearningStage.COMPLETE) {
      return renderCompleteScreen();
    }

    if (!currentWord) return null;

    switch (learningStage) {
      case LearningStage.RECITE:
        return renderWordLeaning();
      case LearningStage.DETAIL:
        return renderWordDetail();
      default:
        return renderWordLeaning();
    }
  };

  return (
    <div className={styles.wordLearningPage}>
      {learningStage !== LearningStage.COMPLETE && renderPageHeader()}
      <div className={styles.content}>
        {renderMainContent()}
      </div>
    </div>
  )

};

export default WordLearningPage;
