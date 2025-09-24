import {
    Button,
    Checkbox,
    ProgressBar,
    Card,
    Toast,
    DotLoading,
    List
} from 'antd-mobile';
import React, { useState, useEffect, useRef } from 'react';
import {
    AiOutlineReload,
    AiOutlineBook,
    AiOutlineStar
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { aiService, type Word, type StoryGenerationProgress, AI_CONFIG } from '../../network/ai';

// 模拟单词数据
const SAMPLE_WORDS = [
    { id: 1, word: 'abandon', meaning: '放弃，抛弃', selected: false },
    { id: 2, word: 'ability', meaning: '能力，才能', selected: false },
    { id: 3, word: 'abroad', meaning: '在国外，到国外', selected: false },
    { id: 4, word: 'absence', meaning: '缺席，不在', selected: false },
    { id: 5, word: 'absolute', meaning: '绝对的，完全的', selected: false },
    { id: 6, word: 'absorb', meaning: '吸收，吸取', selected: false },
    { id: 7, word: 'abstract', meaning: '抽象的，摘要', selected: false },
    { id: 8, word: 'academic', meaning: '学术的，学院的', selected: false },
    { id: 9, word: 'accept', meaning: '接受，承认', selected: false },
    { id: 10, word: 'access', meaning: '通道，进入', selected: false },
    { id: 11, word: 'accident', meaning: '事故，意外', selected: false },
    { id: 12, word: 'accompany', meaning: '陪伴，伴随', selected: false },
    { id: 13, word: 'accomplish', meaning: '完成，实现', selected: false },
    { id: 14, word: 'according', meaning: '根据，按照', selected: false },
    { id: 15, word: 'account', meaning: '账户，说明', selected: false }
];

interface WordWithId extends Word {
    id: number;
    selected: boolean;
}

type PageStatus = 'selection' | 'loading' | 'story';

const StoryVocabularyPage: React.FC = () => {
    const navigate = useNavigate();
    const [pageStatus, setPageStatus] = useState<PageStatus>('selection');
    const [words, setWords] = useState<WordWithId[]>(SAMPLE_WORDS);
    const [selectedWords, setSelectedWords] = useState<WordWithId[]>([]);
    const [progress, setProgress] = useState(0);
    const [generatedStory, setGeneratedStory] = useState<string>('');
    const [currentStage, setCurrentStage] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string>('');
    const abortControllerRef = useRef<AbortController | null>(null);


    // 使用真实AI生成故事
    const generateStory = async () => {
        if (selectedWords.length === 0) {
            Toast.show({
                content: '请至少选择一个单词',
                icon: 'fail'
            });
            return;
        }

        if (selectedWords.length > 10) {
            Toast.show({
                content: '最多选择10个单词',
                icon: 'fail'
            });
            return;
        }

        // 检查AI配置
        if (!AI_CONFIG.apiKey) {
            Toast.show({
                content: 'AI服务未配置，请检查设置',
                icon: 'fail'
            });
            return;
        }

        setIsGenerating(true);
        setPageStatus('loading');
        setProgress(0);
        setCurrentStage('正在准备...');
        setError('');
        setGeneratedStory('');

        // 创建取消控制器
        abortControllerRef.current = new AbortController();

        try {
            // 转换单词格式
            const wordsForAI: Word[] = selectedWords.map(w => ({
                word: w.word,
                meaning: w.meaning
            }));

            // 调用AI服务生成故事
            await aiService.generateStoryStream(
                {
                    words: wordsForAI,
                    level: 'intermediate',
                    maxLength: 800
                },
                // 进度回调
                (progress: StoryGenerationProgress) => {
                    setProgress(progress.progress);
                    setCurrentStage(progress.message);
                },
                // 内容流回调
                (chunk: string) => {
                    setGeneratedStory(prev => prev + chunk);
                }
            );

            // 生成完成
            setProgress(100);
            setCurrentStage('故事创作完成！');
            setPageStatus('story');
            setIsGenerating(false);

            Toast.show({
                content: '故事生成完成！',
                icon: 'success'
            });

        } catch (error: any) {
            console.error('故事生成失败:', error);
            setIsGenerating(false);
            setError(error.message || '生成故事时出现错误');

            // 如果不是用户主动取消，则显示错误
            if (error.name !== 'AbortError') {
                Toast.show({
                    content: error.message || '生成故事失败，请重试',
                    icon: 'fail'
                });

                // 返回选择页面
                setPageStatus('selection');
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

    // 处理单词选择
    const handleWordToggle = (wordId: number) => {
        setWords(prevWords =>
            prevWords.map(word =>
                word.id === wordId
                    ? { ...word, selected: !word.selected }
                    : word
            )
        );
    };

    // 更新选中的单词列表
    useEffect(() => {
        const selected = words.filter(word => word.selected);
        setSelectedWords(selected);
    }, [words]);

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (aiService.isRequesting()) {
                aiService.abort();
            }
        };
    }, []);

    // 全选/取消全选
    const handleSelectAll = () => {
        const hasSelected = words.some(word => word.selected);
        setWords(prevWords =>
            prevWords.map(word => ({ ...word, selected: !hasSelected }))
        );
    };

    // 取消生成
    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        if (aiService.isRequesting()) {
            aiService.abort();
        }
        setIsGenerating(false);
        setPageStatus('selection');
        setProgress(0);
        setGeneratedStory('');
        setCurrentStage('');
        setError('');

        Toast.show({
            content: '已取消生成',
            icon: 'success'
        });
    };

    // 重新生成故事
    const handleRegenerate = () => {
        setPageStatus('selection');
        setProgress(0);
        setGeneratedStory('');
        setError('');
        setCurrentStage('');
    };

    // 渲染单词选择页面
    const renderSelectionPage = () => (
        <div className={styles.selectionPage}>
            <div className={styles.selectionHeader}>
                <h3>选择学习单词</h3>
                <p>请选择想要融入故事的单词（建议3-8个）</p>
                <div className={styles.selectionControls}>
                    <Button
                        size="small"
                        fill="none"
                        onClick={handleSelectAll}
                    >
                        {words.some(word => word.selected) ? '取消全选' : '全选'}
                    </Button>
                    <span className={styles.selectedCount}>
                        已选择 {selectedWords.length}/10
                    </span>
                </div>
            </div>

            <List className={styles.wordList}>
                {words.map((word) => (
                    <List.Item
                        key={word.id}
                        className={`${styles.wordItem} ${word.selected ? styles.selected : ''}`}
                        onClick={() => handleWordToggle(word.id)}
                        prefix={
                            <Checkbox
                                checked={word.selected}
                                onChange={() => handleWordToggle(word.id)}
                            />
                        }
                    >
                        <div className={styles.wordContent}>
                            <div className={styles.wordText}>{word.word}</div>
                            <div className={styles.wordMeaning}>{word.meaning}</div>
                        </div>
                    </List.Item>
                ))}
            </List>

            <div className={styles.selectionFooter}>
                <Button
                    color="primary"
                    block
                    size="large"
                    onClick={generateStory}
                    disabled={selectedWords.length === 0 || isGenerating}
                    loading={isGenerating}
                >
                    <AiOutlineBook style={{ marginRight: 8 }} />
                    {isGenerating ? '正在生成...' : `生成故事 (${selectedWords.length}个单词)`}
                </Button>
            </div>
        </div>
    );

    // 渲染加载页面
    const renderLoadingPage = () => (
        <div className={styles.loadingPage}>
            <div className={styles.loadingContent}>
                <div className={styles.loadingIcon}>
                    <AiOutlineBook className={styles.bookIcon} />
                    <DotLoading color="primary" />
                </div>

                <h3>AI正在创作故事...</h3>
                <p>为您的{selectedWords.length}个单词编织精彩故事</p>

                <div className={styles.progressSection}>
                    <ProgressBar
                        percent={progress}
                        className={styles.progressBar}
                    />
                    <div className={styles.progressText}>
                        {currentStage || '正在准备...'}
                    </div>
                </div>

                <div className={styles.selectedWordsPreview}>
                    <div className={styles.previewTitle}>选中的单词：</div>
                    <div className={styles.wordsGrid}>
                        {selectedWords.map((word) => (
                            <span key={word.id} className={styles.wordTag}>
                                {word.word}
                            </span>
                        ))}
                    </div>
                </div>

                {/* 添加取消按钮 */}
                <div className={styles.loadingActions}>
                    <Button
                        color="default"
                        size="small"
                        onClick={cancelGeneration}
                        disabled={!isGenerating}
                    >
                        取消生成
                    </Button>
                </div>

                {/* 错误显示 */}
                {error && (
                    <div className={styles.errorMessage}>
                        ⚠️ {error}
                    </div>
                )}
            </div>
        </div>
    );

    // 渲染故事页面
    const renderStoryPage = () => (
        <div className={styles.storyPage}>
            <Card className={styles.storyCard}>
                <div className={styles.storyHeader}>
                    <div className={styles.storyMeta}>
                        <AiOutlineStar className={styles.starIcon} />
                        <span>AI创作 • {selectedWords.length}个单词</span>
                    </div>
                </div>

                <div className={styles.storyContent}>
                    {generatedStory.split('\n').map((line, index) => {
                        if (line.startsWith('# ')) {
                            return <h2 key={index} className={styles.storyTitle}>{line.slice(2)}</h2>;
                        }
                        if (line.startsWith('**') && line.endsWith('**')) {
                            return <p key={index} className={styles.storySubtitle}>{line.slice(2, -2)}</p>;
                        }
                        if (line.startsWith('---')) {
                            return <hr key={index} className={styles.storyDivider} />;
                        }
                        if (line.trim() === '') {
                            return <br key={index} />;
                        }

                        // 高亮显示选中的单词
                        let processedLine = line;
                        selectedWords.forEach(word => {
                            const regex = new RegExp(`\\b${word.word}\\b`, 'gi');
                            processedLine = processedLine.replace(regex, `<mark class="${styles.highlightWord}">$&</mark>`);
                        });

                        return (
                            <p
                                key={index}
                                className={styles.storyParagraph}
                                dangerouslySetInnerHTML={{ __html: processedLine }}
                            />
                        );
                    })}
                </div>
            </Card>

            <div className={styles.storyFooter}>
                <Button
                    color="default"
                    size="large"
                    onClick={handleRegenerate}
                    style={{ flex: 1 }}
                >
                    <AiOutlineReload style={{ marginRight: 8 }} />
                    重新选词
                </Button>
                <Button
                    color="primary"
                    size="large"
                    onClick={() => navigate('/vocabulary-practice')}
                    style={{ flex: 1, marginLeft: 12 }}
                >
                    开始学习
                </Button>
            </div>
        </div>
    );

    // 渲染页面标题
    const getPageTitle = () => {
        switch (pageStatus) {
            case 'selection': return '选择单词';
            case 'loading': return 'AI创作中';
            case 'story': return '故事背单词';
            default: return '故事背单词';
        }
    };

    // 渲染返回按钮
    const handleBack = () => {
        if (pageStatus === 'story') {
            setPageStatus('selection');
        } else {
            navigate(-1);
        }
    };

    return (
        <div className={styles.storyVocabularyPage}>
            <PageHeader
                title={getPageTitle()}
                showBack={true}
                onBack={handleBack}
                className={styles.pageHeader}
            />

            <div className={styles.pageContent}>
                {pageStatus === 'selection' && renderSelectionPage()}
                {pageStatus === 'loading' && renderLoadingPage()}
                {pageStatus === 'story' && renderStoryPage()}
            </div>
        </div>
    );
};

export default StoryVocabularyPage;
