import { Tag } from 'antd-mobile';
import React, { useCallback, useMemo } from 'react';
import {
  AiOutlineBook,
  AiOutlineStar,
  AiOutlineClockCircle,
} from 'react-icons/ai';

import styles from './index.module.less';
import { InteractiveText } from '../../../../../components/interactive-text/InteractiveText';

interface ArticleHeaderProps {
  title: string;
  wordCount: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  articleType: 'STORY' | 'NEWS' | 'ESSAY' | 'CONVERSATION';
  length: 'SHORT' | 'MEDIUM' | 'LONG';
  usedWords?: string[];
  createdAt: string;
  showWords?: boolean;
}

const ArticleHeader: React.FC<ArticleHeaderProps> = ({
  title,
  wordCount,
  difficulty,
  articleType,
  length,
  usedWords = [],
  createdAt,
  showWords = true,
}) => {
  // 格式化日期
  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  // 获取难度标签颜色
  const getDifficultyColor = useCallback((difficulty: string) => {
    switch (difficulty) {
      case 'EASY':
        return 'success';
      case 'MEDIUM':
        return 'warning';
      case 'HARD':
        return 'danger';
      default:
        return 'default';
    }
  }, []);

  // 获取难度标签文本
  const getDifficultyText = useCallback((difficulty: string) => {
    switch (difficulty) {
      case 'EASY':
        return '初级';
      case 'MEDIUM':
        return '中级';
      case 'HARD':
        return '高级';
      default:
        return difficulty;
    }
  }, []);

  // 获取文章类型文本
  const getArticleTypeText = useCallback((type: string) => {
    switch (type) {
      case 'STORY':
        return '故事';
      case 'NEWS':
        return '新闻';
      case 'ESSAY':
        return '议论文';
      case 'CONVERSATION':
        return '对话';
      default:
        return type;
    }
  }, []);

  // 获取长度文本
  const getLengthText = useCallback((length: string) => {
    switch (length) {
      case 'SHORT':
        return '短篇';
      case 'MEDIUM':
        return '中篇';
      case 'LONG':
        return '长篇';
      default:
        return length;
    }
  }, []);

  // 渲染标签列表
  const renderTags = () => (
    <div className={styles.tagsContainer}>
      <Tag color={getDifficultyColor(difficulty)}>
        {getDifficultyText(difficulty)}
      </Tag>
      <Tag>{getArticleTypeText(articleType)}</Tag>
      <Tag>{getLengthText(length)}</Tag>
    </div>
  );

  // 将 usedWords 转换为 ITWord 格式
  const words = useMemo(() => {
    return (
      usedWords?.map((word) => ({
        word: word.toLowerCase(),
        highlight: true,
      })) || []
    );
  }, [usedWords]);

  // 渲染单词列表
  const renderWordsList = () => {
    if (!showWords || !usedWords || usedWords.length === 0) {
      return null;
    }

    return (
      <div className={styles.wordsContainer}>
        {usedWords.map((word, index) => (
          <span key={index} className={styles.wordTag}>
            {word}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.articleHeader}>
      <h1 className={styles.title}>
        <InteractiveText content={title} words={words} />
      </h1>

      {/* 文章元信息 */}
      <div className={styles.metaContainer}>
        <div className={styles.metaItem}>
          <AiOutlineBook className={styles.metaIcon} />
          <span>AI创作文章</span>
        </div>
        <div className={styles.metaItem}>
          <AiOutlineStar className={styles.metaIcon} />
          <span>{wordCount}词</span>
        </div>
        <div className={styles.metaItem}>
          <AiOutlineClockCircle className={styles.metaIcon} />
          <span>{formatDate(createdAt)}</span>
        </div>
      </div>

      {/* 文章标签 */}
      {renderTags()}

      {/* 单词列表 */}
      {renderWordsList()}
    </div>
  );
};

export default ArticleHeader;
