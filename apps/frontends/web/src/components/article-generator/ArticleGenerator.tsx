import { Button, Picker, Toast, DotLoading, ProgressBar } from 'antd-mobile';
import React, { useState, useEffect, useCallback } from 'react';
import { AiOutlineBook } from 'react-icons/ai';

import styles from './index.module.less';
import type {
  ArticleConfig,
  ArticleGeneratorProps,
  ThemeOption,
  DifficultyOption,
  LengthOption,
  ArticleTypeOption,
} from './types';
import { generateAndSave } from '../../modules/ai/api';
import { WordSelector } from '../word-selector';

// 主题选项
const THEMES: ThemeOption[] = [
  { value: 'daily_life', label: '日常生活', emoji: '🏠' },
  { value: 'science', label: '科学技术', emoji: '🔬' },
  { value: 'travel', label: '旅行探险', emoji: '✈️' },
  { value: 'business', label: '商务职场', emoji: '💼' },
  { value: 'education', label: '教育学习', emoji: '📚' },
  { value: 'environment', label: '环境保护', emoji: '🌱' },
  { value: 'culture', label: '文化艺术', emoji: '🎨' },
  { value: 'sports', label: '体育运动', emoji: '⚽' },
];

// 难度选项
const DIFFICULTIES: DifficultyOption[] = [
  {
    value: 'easy',
    label: '初级',
    description: '简单词汇，基础语法',
    wordCount: '100-200词',
  },
  {
    value: 'medium',
    label: '中级',
    description: '常用词汇，复合句型',
    wordCount: '200-300词',
  },
  {
    value: 'hard',
    label: '高级',
    description: '高级词汇，复杂语法',
    wordCount: '300-400词',
  },
];

// 长度选项
const LENGTHS: LengthOption[] = [
  { value: 'short', label: '短篇', wordCount: '100-200词' },
  { value: 'medium', label: '中篇', wordCount: '200-300词' },
  { value: 'long', label: '长篇', wordCount: '300-400词' },
];

// 文章类型选项
const ARTICLE_TYPES: ArticleTypeOption[] = [
  { value: 'story', label: '故事', emoji: '📖' },
  { value: 'news', label: '新闻', emoji: '📰' },
  { value: 'essay', label: '议论文', emoji: '📝' },
  { value: 'conversation', label: '对话', emoji: '💬' },
];

const ArticleGenerator: React.FC<ArticleGeneratorProps> = ({
  onConfigChange,
  onGenerate,
  onArticleGenerated,
  initialConfig,
  disabled = false,
  className,
  showLoading = false,
}) => {
  const [config, setConfig] = useState<ArticleConfig>({
    words: [],
    difficulty: 'easy', // 默认第一个选项
    theme: 'daily_life', // 默认第一个选项
    length: 'short', // 默认第一个选项
    articleType: 'story', // 默认第一个选项
    useWeakWords: false, // 默认使用自定义单词
    ...initialConfig,
  });

  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState<string>('');
  const [error, setError] = useState<string>('');

  // 当配置变化时通知父组件
  useEffect(() => {
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  // 处理单词选择
  const handleWordSelect = useCallback((word: any) => {
    const newWord = {
      id: word.id || Date.now().toString(),
      word: word.word,
      tranCn: word.tranCn || word.description,
    };

    setConfig((prev) => ({
      ...prev,
      words: [...prev.words, newWord],
    }));
  }, []);

  // 处理单词文本变化
  const handleWordTextChange = useCallback(() => {
    // 可以在这里处理文本变化，暂时不需要
  }, []);

  // 处理生成
  const handleGenerate = useCallback(async () => {
    // 如果使用自定义单词，需要验证单词数量
    if (!config.useWeakWords) {
      if (config.words.length === 0) {
        Toast.show({
          content: '请至少选择一个单词',
          icon: 'fail',
        });
        return;
      }

      if (config.words.length > 10) {
        Toast.show({
          content: '最多选择10个单词',
          icon: 'fail',
        });
        return;
      }
    }

    // 如果showLoading为true，则在这里处理生成逻辑
    if (showLoading) {
      setIsGenerating(true);
      setProgress(0);
      setCurrentStage('正在准备...');
      setError('');

      try {
        // 转换单词格式
        const wordsForAI = config.words.map((w) => ({
          word: w.word,
          tranCn: w.tranCn,
        }));

        setProgress(20);
        setCurrentStage('AI正在生成文章...');

        // 调用AI服务生成文章
        const requestParams: any = {
          difficulty: config.difficulty,
          theme: config.theme,
          length: config.length,
          articleType: config.articleType,
        };

        if (config.useWeakWords) {
          requestParams.useWeakWords = true;
        } else {
          requestParams.words = wordsForAI;
        }

        const result = await generateAndSave(requestParams);

        if (result.data.success && result.data.article) {
          setProgress(100);
          setCurrentStage('生成完成！');

          onArticleGenerated?.(result.data.article);

          Toast.show({
            content: '文章生成完成！',
            icon: 'success',
          });
        } else {
          throw new Error(result.data.error || '生成文章失败');
        }
      } catch (error: any) {
        console.error('生成失败:', error);
        setError(error.message || '生成时出现错误');

        Toast.show({
          content: error.message || '生成失败，请重试',
          icon: 'fail',
        });
      } finally {
        setIsGenerating(false);
      }
    } else {
      // 如果showLoading为false，则调用原来的onGenerate
      onGenerate?.(config);
    }
  }, [config, onGenerate, onArticleGenerated, showLoading]);

  // 渲染单词来源切换按钮
  const renderWordSourceToggle = () => {
    return (
      <div className={styles.section}>
        <h3>单词来源</h3>
        <div className={styles.wordSourceToggle}>
          <button
            type="button"
            className={`${styles.toggleOption} ${!config.useWeakWords ? styles.active : ''}`}
            onClick={() =>
              !disabled &&
              setConfig((prev) => ({ ...prev, useWeakWords: false }))
            }
            disabled={disabled}
          >
            <span className={styles.toggleEmoji}>✏️</span>
            <span className={styles.toggleLabel}>自定义单词</span>
          </button>
          <button
            type="button"
            className={`${styles.toggleOption} ${config.useWeakWords ? styles.active : ''}`}
            onClick={() =>
              !disabled &&
              setConfig((prev) => ({ ...prev, useWeakWords: true }))
            }
            disabled={disabled}
          >
            <span className={styles.toggleEmoji}>🎯</span>
            <span className={styles.toggleLabel}>薄弱词汇</span>
          </button>
        </div>
        {config.useWeakWords && (
          <div className={styles.weakWordsHint}>
            <span>✨ 系统将自动分析您的薄弱词汇并生成文章</span>
          </div>
        )}
      </div>
    );
  };

  // 渲染单词选择器
  const renderWordSelector = () => {
    // 如果使用薄弱词汇，不显示单词选择器
    if (config.useWeakWords) {
      return null;
    }

    return (
      <div className={styles.section}>
        <WordSelector
          placeholder="使用 @ 选择单词..."
          onWordSelect={handleWordSelect}
          onChange={handleWordTextChange}
          disabled={disabled}
          className={styles.wordSelector}
        />
      </div>
    );
  };

  // 渲染场景选择
  const renderThemeSelector = () => {
    const selectedTheme = THEMES.find((theme) => theme.value === config.theme);

    return (
      <div className={styles.section}>
        <h3>选择场景</h3>
        <Picker
          columns={[THEMES]}
          value={[config.theme]}
          onConfirm={(value) =>
            !disabled &&
            setConfig((prev) => ({ ...prev, theme: value[0] as any }))
          }
        >
          {(_, actions) => (
            <div
              className={styles.pickerTrigger}
              onClick={disabled ? undefined : actions.open}
            >
              <span className={styles.pickerEmoji}>{selectedTheme?.emoji}</span>
              <span className={styles.pickerLabel}>{selectedTheme?.label}</span>
              <span className={styles.pickerArrow}>▼</span>
            </div>
          )}
        </Picker>
      </div>
    );
  };

  // 渲染难度选择
  const renderDifficultySelector = () => {
    const selectedDifficulty = DIFFICULTIES.find(
      (difficulty) => difficulty.value === config.difficulty,
    );

    return (
      <div className={styles.section}>
        <h3>选择难度</h3>
        <Picker
          columns={[DIFFICULTIES]}
          value={[config.difficulty]}
          onConfirm={(value) =>
            !disabled &&
            setConfig((prev) => ({ ...prev, difficulty: value[0] as any }))
          }
        >
          {(_, actions) => (
            <div
              className={styles.pickerTrigger}
              onClick={disabled ? undefined : actions.open}
            >
              <span className={styles.pickerLabel}>
                {selectedDifficulty?.label}
              </span>
              <span className={styles.pickerDescription}>
                {selectedDifficulty?.description}
              </span>
              <span className={styles.pickerArrow}>▼</span>
            </div>
          )}
        </Picker>
      </div>
    );
  };

  // 渲染字数选择
  const renderLengthSelector = () => {
    const selectedLength = LENGTHS.find(
      (length) => length.value === config.length,
    );

    return (
      <div className={styles.section}>
        <h3>选择字数</h3>
        <Picker
          columns={[LENGTHS]}
          value={[config.length]}
          onConfirm={(value) =>
            !disabled &&
            setConfig((prev) => ({ ...prev, length: value[0] as any }))
          }
        >
          {(_, actions) => (
            <div
              className={styles.pickerTrigger}
              onClick={disabled ? undefined : actions.open}
            >
              <span className={styles.pickerLabel}>
                {selectedLength?.label}
              </span>
              <span className={styles.pickerDescription}>
                {selectedLength?.wordCount}
              </span>
              <span className={styles.pickerArrow}>▼</span>
            </div>
          )}
        </Picker>
      </div>
    );
  };

  // 渲染文章类型选择
  const renderArticleTypeSelector = () => {
    const selectedType = ARTICLE_TYPES.find(
      (type) => type.value === config.articleType,
    );

    return (
      <div className={styles.section}>
        <h3>选择文章类型</h3>
        <Picker
          columns={[ARTICLE_TYPES]}
          value={[config.articleType]}
          onConfirm={(value) =>
            !disabled &&
            setConfig((prev) => ({ ...prev, articleType: value[0] as any }))
          }
        >
          {(_, actions) => (
            <div
              className={styles.pickerTrigger}
              onClick={disabled ? undefined : actions.open}
            >
              <span className={styles.pickerEmoji}>{selectedType?.emoji}</span>
              <span className={styles.pickerLabel}>{selectedType?.label}</span>
              <span className={styles.pickerArrow}>▼</span>
            </div>
          )}
        </Picker>
      </div>
    );
  };

  // 渲染加载状态
  const renderLoadingState = () => (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingContent}>
        <div className={styles.loadingIcon}>
          <AiOutlineBook className={styles.bookIcon} />
          <DotLoading color="primary" />
        </div>

        <h3>AI正在生成文章...</h3>
        <p>
          {config.useWeakWords
            ? '正在分析您的薄弱词汇并生成练习'
            : `为您的${config.words.length}个单词创建练习`}
        </p>

        <div className={styles.progressSection}>
          <ProgressBar percent={progress} className={styles.progressBar} />
          <div className={styles.progressText}>
            {currentStage || '正在准备...'}
          </div>
        </div>

        {config.words.length > 0 && (
          <div className={styles.selectedWordsPreview}>
            <div className={styles.previewTitle}>选中的单词：</div>
            <div className={styles.wordsGrid}>
              {config.words.map((word) => (
                <span key={word.id} className={styles.wordTag}>
                  {word.word}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <div className={styles.errorMessage}>⚠️ {error}</div>}
      </div>
    </div>
  );

  return (
    <div className={`${styles.articleGenerator} ${className}`}>
      {isGenerating ? (
        renderLoadingState()
      ) : (
        <>
          <div className={styles.configContainer}>
            {renderWordSourceToggle()}
            {renderWordSelector()}
            {renderThemeSelector()}
            {renderDifficultySelector()}
            {renderLengthSelector()}
            {renderArticleTypeSelector()}
          </div>

          <div className={styles.generateSection}>
            <Button
              color="primary"
              block
              size="large"
              onClick={handleGenerate}
              disabled={
                disabled || (!config.useWeakWords && config.words.length === 0)
              }
              className={styles.generateButton}
            >
              <AiOutlineBook className={styles.buttonIcon} />
              <span>生成文章</span>
              {!config.useWeakWords && (
                <span className={styles.wordCount}>
                  ({config.words.length}个单词)
                </span>
              )}
              {config.useWeakWords && (
                <span className={styles.wordCount}>(使用薄弱词汇)</span>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ArticleGenerator;
