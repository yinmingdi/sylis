export interface ProficiencyData {
  reviewCount: number;
  errorCount: number;
  lastReviewedAt: Date | null;
  learningStatus: string;
}

export interface DifficultyData {
  headword: string;
  star: number;
  reviewCount: number;
  errorCount: number;
}

export interface ProficiencyResult {
  score: number;
  level: string;
  label: string;
  color: string;
}

export interface DifficultyResult {
  score: number;
  level: string;
  label: string;
  color: string;
}

export class ProficiencyCalculator {
  /**
   * 计算复习次数得分 (0-100)
   */
  private static getReviewCountScore(reviewCount: number): number {
    return Math.min(reviewCount * 10, 100);
  }

  /**
   * 计算正确率得分 (0-100)
   */
  private static getAccuracyScore(
    reviewCount: number,
    errorCount: number,
  ): number {
    if (reviewCount === 0) return 0;
    const accuracy = (reviewCount - errorCount) / reviewCount;
    return accuracy * 100;
  }

  /**
   * 计算时间衰减得分 (0-100)
   * 根据最后复习时间计算记忆衰减程度
   */
  private static getTimeDecayScore(lastReviewedAt: Date | null): number {
    if (!lastReviewedAt) return 0;

    const daysSince =
      (Date.now() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince <= 1) return 100;
    if (daysSince <= 3) return 90;
    if (daysSince <= 7) return 70;
    if (daysSince <= 14) return 50;
    if (daysSince <= 30) return 30;
    return 10; // 超过30天
  }

  /**
   * 计算SRS状态得分 (0-100)
   */
  private static getStatusScore(status: string): number {
    switch (status) {
      case 'MASTERED':
        return 100;
      case 'REVIEW':
        return 75;
      case 'LEARNING':
        return 50;
      case 'NEW':
        return 25;
      default:
        return 0;
    }
  }

  /**
   * 综合计算熟练度
   * 公式：熟练度 = 复习次数(30%) + 正确率(40%) + 时间衰减(20%) + SRS状态(10%)
   */
  static calculateProficiency(data: ProficiencyData): ProficiencyResult {
    const reviewScore = this.getReviewCountScore(data.reviewCount);
    const accuracyScore = this.getAccuracyScore(
      data.reviewCount,
      data.errorCount,
    );
    const timeDecayScore = this.getTimeDecayScore(data.lastReviewedAt);
    const statusScore = this.getStatusScore(data.learningStatus);

    const score = Math.round(
      reviewScore * 0.3 +
        accuracyScore * 0.4 +
        timeDecayScore * 0.2 +
        statusScore * 0.1,
    );

    let level: string, label: string, color: string;

    if (score >= 80) {
      level = 'mastered';
      label = '已掌握';
      color = '#06d6a0';
    } else if (score >= 60) {
      level = 'familiar';
      label = '熟悉';
      color = '#2ec4b6';
    } else if (score >= 40) {
      level = 'learning';
      label = '学习中';
      color = '#ff9f1c';
    } else if (score >= 20) {
      level = 'unfamiliar';
      label = '不熟悉';
      color = '#f77f00';
    } else {
      level = 'new';
      label = '新词';
      color = '#9ca3af';
    }

    return { score, level, label, color };
  }

  /**
   * 计算单词复杂度 (0-100)
   */
  private static getWordComplexity(word: string): number {
    let score = 0;

    // 1. 长度评分（40分）
    const length = word.length;
    if (length <= 4) score += 10;
    else if (length <= 6) score += 20;
    else if (length <= 8) score += 30;
    else score += 40;

    // 2. 音节复杂度（30分）- 简化版：元音字母数
    const vowels = word.match(/[aeiou]/gi)?.length || 0;
    if (vowels <= 1) score += 5;
    else if (vowels <= 2) score += 15;
    else if (vowels <= 3) score += 25;
    else score += 30;

    // 3. 特殊字符/组合评分（30分）
    const hasComplexCombos = /[qxz]|ph|gh|tion|sion|ough/.test(
      word.toLowerCase(),
    );
    if (hasComplexCombos) score += 30;
    else score += 10;

    return Math.min(score, 100);
  }

  /**
   * 综合计算难易度
   * 公式：难易度 = 单词复杂度(40%) + 用户表现(30%) + 词频难度(30%)
   */
  static calculateDifficulty(data: DifficultyData): DifficultyResult {
    // 单词复杂度
    const complexityScore = this.getWordComplexity(data.headword);

    // 用户表现（错误率越高，难度越大）
    const userPerformance =
      data.reviewCount > 0 ? (data.errorCount / data.reviewCount) * 100 : 50; // 默认中等

    // 词频难度（star: 1-5，1最常见，5最生僻）
    const frequencyDifficulty = (6 - data.star) * 20;

    const score = Math.round(
      complexityScore * 0.4 + userPerformance * 0.3 + frequencyDifficulty * 0.3,
    );

    let level: string, label: string, color: string;

    if (score >= 70) {
      level = 'hard';
      label = '困难';
      color = '#f71735';
    } else if (score >= 40) {
      level = 'medium';
      label = '中等';
      color = '#ff9f1c';
    } else {
      level = 'easy';
      label = '简单';
      color = '#06d6a0';
    }

    return { score, level, label, color };
  }

  /**
   * 计算正确率 (0-1)
   */
  static calculateAccuracyRate(
    reviewCount: number,
    errorCount: number,
  ): number {
    if (reviewCount === 0) return 0;
    return (reviewCount - errorCount) / reviewCount;
  }
}

