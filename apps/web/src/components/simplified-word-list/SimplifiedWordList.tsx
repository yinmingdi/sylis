import { Card, Grid, Badge } from 'antd-mobile';
import React from 'react';
import {
  AiOutlineSound,
  AiOutlineHeart,
  AiFillHeart
} from 'react-icons/ai';

import styles from './index.module.less';

// 播放有道词典音频
const playYoudaoAudio = (word: string, type: 'uk' | 'us') => {
  const audioType = type === 'uk' ? 1 : 2;
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${audioType}`;

  const audio = new Audio(audioUrl);
  audio.play().catch((error) => {
    console.warn('Failed to play audio:', error);
  });
};

export interface WordMeaning {
  id: string;
  partOfSpeech: string;
  meaningCn: string;
  meaningEn?: string;
}

export interface WordItem {
  id: string;
  headword: string;
  ukPhonetic?: string;
  usPhonetic?: string;
  ukAudio?: string;
  usAudio?: string;
  star: number;
  meanings: WordMeaning[];
  isCollected?: boolean;
  learningStatus?: 'new' | 'learning' | 'mastered' | 'review' | 'familiar' | 'unfamiliar';
  difficulty?: 'easy' | 'medium' | 'hard';
  proficiencyScore?: number;
  proficiencyLevel?: string;
  difficultyScore?: number;
  accuracyRate?: number;
  reviewCount?: number;
}

interface SimplifiedWordListProps {
  words: WordItem[];
  onWordClick?: (word: WordItem) => void;
  onToggleCollect?: (wordId: string, collected: boolean) => void;
  onPlayAudio?: (word: string, type: 'uk' | 'us') => void;
  showCollectButton?: boolean;
  showDifficulty?: boolean;
  showProficiency?: boolean;
  loading?: boolean;
  editMode?: boolean;
  selectedWords?: string[];
}

const SimplifiedWordList: React.FC<SimplifiedWordListProps> = ({
  words = [],
  onWordClick,
  onToggleCollect,
  onPlayAudio,
  showCollectButton = true,
  showDifficulty = false,
  showProficiency = false,
  loading = false,
  editMode = false,
  selectedWords = []
}) => {
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'new':
        return '#9ca3af';
      case 'unfamiliar':
        return '#f77f00';
      case 'learning':
        return '#ff9f1c';
      case 'familiar':
        return '#2ec4b6';
      case 'mastered':
        return '#06d6a0';
      case 'review':
        return '#f71735';
      default:
        return '#9ca3af';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'new':
        return '新词';
      case 'unfamiliar':
        return '不熟悉';
      case 'learning':
        return '学习中';
      case 'familiar':
        return '熟悉';
      case 'mastered':
        return '已掌握';
      case 'review':
        return '复习';
      default:
        return '';
    }
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case 'easy':
        return '#06d6a0';
      case 'medium':
        return '#ff9f1c';
      case 'hard':
        return '#f71735';
      default:
        return '#9ca3af';
    }
  };

  const getDifficultyLabel = (difficulty?: string) => {
    switch (difficulty) {
      case 'easy':
        return '简单';
      case 'medium':
        return '中等';
      case 'hard':
        return '困难';
      default:
        return '';
    }
  };

  const handleWordClick = (word: WordItem) => {
    onWordClick?.(word);
  };

  const handleToggleCollect = (e: React.MouseEvent, wordId: string, isCollected: boolean) => {
    e.stopPropagation();
    onToggleCollect?.(wordId, !isCollected);
  };

  const handlePlayAudio = (e: React.MouseEvent, word: string, type: 'uk' | 'us') => {
    e.stopPropagation();
    if (onPlayAudio) {
      onPlayAudio(word, type);
    } else {
      // 如果没有传入onPlayAudio回调，直接使用有道词典播放
      playYoudaoAudio(word, type);
    }
  };

  // 获取第一个有效的释义
  const getFirstMeaning = (meanings: WordMeaning[]) => {
    return meanings.find(meaning => meaning.meaningCn && meaning.meaningCn.trim()) || meanings[0];
  };

  const renderWordCard = (word: WordItem) => {
    const isSelected = selectedWords.includes(word.id);
    const firstMeaning = getFirstMeaning(word.meanings);

    return (
      <Card
        key={word.id}
        className={`${styles.wordCard} ${isSelected ? styles.selected : ''}`}
        onClick={() => handleWordClick(word)}
      >
        <div className={styles.cardContent}>
          <div className={styles.wordHeader}>
            <div className={styles.wordMain}>
              <div className={styles.wordText}>
                <h3 className={styles.headword}>{word.headword}</h3>
                {(word.usPhonetic || word.ukPhonetic) && (
                  <div className={styles.phonetic}>
                    <span className={styles.phoneticLabel}>
                      {word.usPhonetic ? '美' : '英'}
                    </span>
                    <span className={styles.phoneticText}>
                      /{word.usPhonetic || word.ukPhonetic}/
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.wordActions}>
                <div
                  className={styles.audioBtn}
                  onClick={(e) => handlePlayAudio(e, word.headword, word.usPhonetic ? 'us' : 'uk')}
                >
                  <AiOutlineSound />
                </div>
                {showCollectButton && !editMode && (
                  <div
                    className={styles.collectBtn}
                    onClick={(e) => handleToggleCollect(e, word.id, word.isCollected || false)}
                  >
                    {word.isCollected ? (
                      <AiFillHeart className={styles.heartFilled} />
                    ) : (
                      <AiOutlineHeart className={styles.heart} />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.wordMeta}>
              <div className={styles.badges}>
                {showProficiency && word.proficiencyLevel && (
                  <Badge
                    content={getStatusLabel(word.proficiencyLevel)}
                    style={{
                      backgroundColor: getStatusColor(word.proficiencyLevel),
                      color: '#fff'
                    } as React.CSSProperties}
                  />
                )}
                {showDifficulty && word.difficulty && (
                  <Badge
                    content={getDifficultyLabel(word.difficulty)}
                    style={{
                      backgroundColor: getDifficultyColor(word.difficulty),
                      color: '#fff'
                    } as React.CSSProperties}
                  />
                )}
              </div>
            </div>
          </div>

          {firstMeaning && (
            <div className={styles.wordMeaning}>
              <span className={styles.partOfSpeech}>{firstMeaning.partOfSpeech}</span>
              <span className={styles.meaningText}>{firstMeaning.meaningCn}</span>
            </div>
          )}
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className={styles.wordList}>
        {[1, 2, 3].map((i) => (
          <Card key={i} className={styles.loadingCard}>
            <div className={styles.loadingSkeleton}>
              <div className={styles.loadingTitle} />
              <div className={styles.loadingPhonetic} />
              <div className={styles.loadingMeaning} />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyTitle}>暂无单词</div>
        <div className={styles.emptyDesc}>还没有添加任何单词</div>
      </div>
    );
  }

  return (
    <div className={styles.wordList}>
      <Grid columns={1} gap={12}>
        {words.map((word) => (
          <Grid.Item key={word.id}>
            {renderWordCard(word)}
          </Grid.Item>
        ))}
      </Grid>
    </div>
  );
};

export default SimplifiedWordList;
