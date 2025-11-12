import { Injectable } from '@nestjs/common';

import { DifficultyLevel } from '../types/subreddit.types';

@Injectable()
export class RedditAnalyzeService {
  /**
   * 分析内容难度
   * 基于词汇复杂度、句子长度等指标
   */
  analyzeDifficulty(text: string): DifficultyLevel {
    if (!text || text.length < 50) {
      return DifficultyLevel.BEGINNER;
    }

    // 简单的难度评估算法
    const words = text.split(/\s+/);
    const totalWords = words.length;
    const averageWordLength =
      words.reduce((sum, word) => sum + word.length, 0) / totalWords;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const averageSentenceLength = totalWords / (sentences.length || 1);

    // 计算复杂词汇比例（超过 7 个字母的词）
    const complexWords = words.filter((word) => word.length > 7).length;
    const complexWordRatio = complexWords / totalWords;

    // 评分逻辑
    let score = 0;

    // 平均词长评分
    if (averageWordLength > 6) score += 2;
    else if (averageWordLength > 4.5) score += 1;

    // 平均句长评分
    if (averageSentenceLength > 20) score += 2;
    else if (averageSentenceLength > 15) score += 1;

    // 复杂词汇比例评分
    if (complexWordRatio > 0.3) score += 2;
    else if (complexWordRatio > 0.2) score += 1;

    // 根据总分返回难度等级
    if (score >= 5) return DifficultyLevel.ADVANCED;
    if (score >= 3) return DifficultyLevel.INTERMEDIATE;
    return DifficultyLevel.BEGINNER;
  }

  /**
   * 提取关键词
   */
  extractKeywords(text: string, limit = 10): string[] {
    // 移除常见词和标点
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'should',
      'could',
      'may',
      'might',
      'can',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'they',
      'them',
      'their',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !commonWords.has(word));

    // 计算词频
    const frequency = new Map<string, number>();
    words.forEach((word) => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });

    // 按频率排序并返回前 N 个
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word]) => word);
  }

  /**
   * 计算阅读时间（分钟）
   * 基于平均阅读速度 200-250 词/分钟
   */
  estimateReadingTime(text: string): number {
    const words = text.split(/\s+/).length;
    const minutes = Math.ceil(words / 225);
    return Math.max(1, minutes);
  }
}
