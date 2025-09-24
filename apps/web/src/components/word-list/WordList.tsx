import { Card, Grid, Badge } from 'antd-mobile';
import React from 'react';
import {
    AiOutlinePlayCircle,
    AiOutlineSound,
    AiOutlineStar,
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
    learningStatus?: 'new' | 'learning' | 'mastered' | 'review';
    difficulty?: 'easy' | 'medium' | 'hard';
}

interface WordListProps {
    words: WordItem[];
    onWordClick?: (word: WordItem) => void;
    onToggleCollect?: (wordId: string, collected: boolean) => void;
    onPlayAudio?: (word: string, type: 'uk' | 'us') => void;
    showCollectButton?: boolean;
    showAudio?: boolean; // 已弃用：现在发音按钮总是显示
    showDifficulty?: boolean;
    showStatus?: boolean;
    layout?: 'card' | 'list';
    loading?: boolean;
}

const WordList: React.FC<WordListProps> = ({
    words = [],
    onWordClick,
    onToggleCollect,
    onPlayAudio,
    showCollectButton = true,
    showAudio = true, // 已弃用但保留兼容性
    showDifficulty = false,
    showStatus = false,
    layout = 'card',
    loading = false
}) => {
    // 兼容性：忽略showAudio参数
    void showAudio;
    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'new':
                return '#2ec4b6';
            case 'learning':
                return '#ff9f1c';
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
                return '新学';
            case 'learning':
                return '学习中';
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

    const renderStarRating = (star: number) => {
        return (
            <div className={styles.starRating}>
                {[1, 2, 3, 4, 5].map((level) => (
                    <AiOutlineStar
                        key={level}
                        className={`${styles.star} ${level <= star ? styles.starFilled : ''}`}
                    />
                ))}
            </div>
        );
    };

    const renderWordCard = (word: WordItem) => (
        <Card
            key={word.id}
            className={`${styles.wordCard} ${layout === 'list' ? styles.listCard : ''}`}
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
                            {showCollectButton && (
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
                            {showStatus && word.learningStatus && (
                                <Badge
                                    content={getStatusLabel(word.learningStatus)}
                                    style={{
                                        backgroundColor: getStatusColor(word.learningStatus),
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
                        {renderStarRating(word.star)}
                    </div>
                </div>

                <div className={styles.wordMeanings}>
                    {word.meanings.slice(0, 2).map((meaning) => (
                        <div key={meaning.id} className={styles.meaning}>
                            <span className={styles.partOfSpeech}>{meaning.partOfSpeech}</span>
                            <span className={styles.meaningText}>{meaning.meaningCn}</span>
                        </div>
                    ))}
                    {word.meanings.length > 2 && (
                        <div className={styles.moreIndicator}>
                            +{word.meanings.length - 2} 个释义
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );

    const renderWordList = (word: WordItem) => (
        <div
            key={word.id}
            className={styles.wordListItem}
            onClick={() => handleWordClick(word)}
        >
            <div className={styles.listContent}>
                <div className={styles.listMain}>
                    <div className={styles.listWord}>
                        <h4 className={styles.listHeadword}>{word.headword}</h4>
                        {word.meanings.length > 0 && (
                            <div className={styles.listMeaning}>
                                <span className={styles.listPartOfSpeech}>
                                    {word.meanings[0].partOfSpeech}
                                </span>
                                <span className={styles.listMeaningText}>
                                    {word.meanings[0].meaningCn}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <div className={styles.listActions}>
                    {showCollectButton && (
                        <div
                            className={styles.listCollectBtn}
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
        </div>
    );

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
                <div className={styles.emptyIcon}>
                    <AiOutlinePlayCircle />
                </div>
                <div className={styles.emptyTitle}>暂无单词</div>
                <div className={styles.emptyDesc}>还没有添加任何单词</div>
            </div>
        );
    }

    return (
        <div className={`${styles.wordList} ${layout === 'list' ? styles.listLayout : ''}`}>
            {layout === 'card' ? (
                <Grid columns={1} gap={12}>
                    {words.map((word) => (
                        <Grid.Item key={word.id}>
                            {renderWordCard(word)}
                        </Grid.Item>
                    ))}
                </Grid>
            ) : (
                <div className={styles.listContainer}>
                    {words.map(renderWordList)}
                </div>
            )}
        </div>
    );
};

export default WordList;
