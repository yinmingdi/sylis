import { Injectable, Logger } from '@nestjs/common';

import { WeakVocabularyAnalyzerRepository } from './weak-vocabulary-analyzer.repository';
import { ProficiencyCalculator } from '../../utils/proficiency-calculator';

export interface WeakWordAnalysisOptions {
  /** 熟练度阈值，默认60分 */
  proficiencyThreshold?: number;
  /** 最大单词数量 */
  maxWords?: number;
  /** 优先选择的词性，如 ['n', 'v'] */
  preferredPartOfSpeech?: string[];
  /** 是否排除生僻词（star > 3），默认true */
  excludeRareWords?: boolean;
  /** 词书ID，可选，如果指定则只分析该词书的单词 */
  bookId?: string;
}

export interface WeakWord {
  word: string;
  tranCn: string;
  proficiencyScore: number;
  proficiencyLevel: string;
  wordId: string;
  meanings: Array<{ partOfSpeech: string; meaningCn: string }>;
}

interface WordWithProficiency {
  wordId: string;
  headword: string;
  meanings: Array<{ partOfSpeech: string; meaningCn: string }>;
  star: number;
  proficiencyScore: number;
  proficiencyLevel: string;
  status: string;
  errorCount: number;
  repetition: number;
  lastReview: Date | null;
}

@Injectable()
export class WeakVocabularyAnalyzerService {
  private readonly logger = new Logger(WeakVocabularyAnalyzerService.name);

  constructor(
    private readonly weakVocabularyAnalyzerRepository: WeakVocabularyAnalyzerRepository,
  ) {}

  /**
   * 分析薄弱词汇并选择目标词汇
   * 根据论文要求：
   * - 查询学习者的词汇本或当前学习的词书
   * - 计算每个单词的熟练度分数
   * - 筛选熟练度低于60分的单词
   * - 按分数从低到高排序，分数最低的优先级最高
   * - 根据文章类型选择合适数量的目标词汇
   * - 考虑词性限制（优先选择名词和动词）
   * - 排除过于生僻的单词
   */
  async analyzeWeakWords(
    userId: string,
    options: WeakWordAnalysisOptions = {},
  ): Promise<WeakWord[]> {
    const {
      proficiencyThreshold = 60,
      maxWords,
      preferredPartOfSpeech = ['n', 'v'], // 优先名词和动词
      excludeRareWords = true,
      bookId,
    } = options;

    this.logger.log(
      `开始分析薄弱词汇，用户ID: ${userId}, 词书ID: ${bookId || '全部'}, 阈值: ${proficiencyThreshold}`,
    );

    try {
      // 1. 获取用户学习记录
      const userLearning =
        await this.weakVocabularyAnalyzerRepository.getUserLearning(userId);

      if (!userLearning) {
        this.logger.warn(`用户 ${userId} 没有学习记录`);
        return [];
      }

      // 2. 获取所有学过的单词（从 UserWord 表）
      const userWords = bookId
        ? await this.weakVocabularyAnalyzerRepository.getUserWordsByBook(
            userLearning.id,
            bookId,
          )
        : await this.weakVocabularyAnalyzerRepository.getAllUserWords(
            userLearning.id,
          );

      if (userWords.length === 0) {
        this.logger.warn(`用户 ${userId} 没有学过任何单词`);
        return [];
      }

      this.logger.log(`找到 ${userWords.length} 个学过的单词`);

      // 3. 计算每个单词的熟练度
      const wordsWithProficiency: WordWithProficiency[] = userWords.map(
        (uw) => {
          // 计算复习次数：repetition + errorCount 作为估算
          // 或者可以从 DailyWordProgress 统计，但这里先用 repetition 估算
          const reviewCount = Math.max(
            uw.repetition + uw.errorCount,
            uw.repetition,
          );

          const proficiency = ProficiencyCalculator.calculateProficiency({
            reviewCount,
            errorCount: uw.errorCount,
            lastReviewedAt: uw.lastReview,
            learningStatus: uw.status,
          });

          return {
            wordId: uw.wordId,
            headword: uw.word.headword,
            meanings: uw.word.meanings,
            star: uw.word.star,
            proficiencyScore: proficiency.score,
            proficiencyLevel: proficiency.level,
            status: uw.status,
            errorCount: uw.errorCount,
            repetition: uw.repetition,
            lastReview: uw.lastReview,
          };
        },
      );

      // 4. 筛选薄弱词汇（熟练度分数低于阈值）
      let weakWords = wordsWithProficiency.filter(
        (word) => word.proficiencyScore < proficiencyThreshold,
      );

      this.logger.log(
        `找到 ${weakWords.length} 个薄弱词汇（总词汇数: ${userWords.length}）`,
      );

      if (weakWords.length === 0) {
        return [];
      }

      // 5. 按熟练度分数从低到高排序，分数最低的优先级最高
      weakWords.sort((a, b) => a.proficiencyScore - b.proficiencyScore);

      // 6. 排除生僻词（star > 3）
      if (excludeRareWords) {
        weakWords = weakWords.filter((word) => word.star <= 3);
        this.logger.log(`排除生僻词后剩余 ${weakWords.length} 个薄弱词汇`);
      }

      // 7. 应用词性过滤（优先选择名词和动词）
      let filteredWords = weakWords;

      if (preferredPartOfSpeech && preferredPartOfSpeech.length > 0) {
        // 优先选择包含指定词性的单词
        const preferredWords: WordWithProficiency[] = [];
        const otherWords: WordWithProficiency[] = [];

        for (const word of weakWords) {
          const hasPreferredPOS = word.meanings.some((meaning) =>
            preferredPartOfSpeech.includes(meaning.partOfSpeech.toLowerCase()),
          );

          if (hasPreferredPOS) {
            preferredWords.push(word);
          } else {
            otherWords.push(word);
          }
        }

        // 优先词在前，其他词在后
        filteredWords = [...preferredWords, ...otherWords];
      }

      // 8. 根据 maxWords 限制选择词汇数量
      const selectedWords = maxWords
        ? filteredWords.slice(0, maxWords)
        : filteredWords;

      this.logger.log(
        `选择了 ${selectedWords.length} 个薄弱词汇（共 ${filteredWords.length} 个）`,
      );

      // 10. 转换为目标格式
      const weakWordsResult: WeakWord[] = selectedWords.map((word) => {
        // 选择第一个中文释义作为主要翻译
        const primaryMeaning = word.meanings[0]?.meaningCn || '';

        return {
          word: word.headword,
          tranCn: primaryMeaning,
          proficiencyScore: word.proficiencyScore,
          proficiencyLevel: word.proficiencyLevel,
          wordId: word.wordId,
          meanings: word.meanings,
        };
      });

      return weakWordsResult;
    } catch (error) {
      this.logger.error(
        `分析薄弱词汇失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * 获取薄弱词汇统计信息
   */
  async getWeakWordsStats(
    userId: string,
    bookId?: string,
    proficiencyThreshold: number = 60,
  ): Promise<{
    total: number;
    weak: number;
    critical: number; // 0-30分
    moderate: number; // 30-50分
    mild: number; // 50-60分
  }> {
    try {
      const userLearning =
        await this.weakVocabularyAnalyzerRepository.getUserLearning(userId);

      if (!userLearning) {
        return { total: 0, weak: 0, critical: 0, moderate: 0, mild: 0 };
      }

      const userWords = bookId
        ? await this.weakVocabularyAnalyzerRepository.getUserWordsByBook(
            userLearning.id,
            bookId,
          )
        : await this.weakVocabularyAnalyzerRepository.getAllUserWords(
            userLearning.id,
          );

      const total = userWords.length;

      // 计算熟练度并筛选
      const wordsWithProficiency = userWords.map((uw) => {
        const reviewCount = Math.max(
          uw.repetition + uw.errorCount,
          uw.repetition,
        );
        const proficiency = ProficiencyCalculator.calculateProficiency({
          reviewCount,
          errorCount: uw.errorCount,
          lastReviewedAt: uw.lastReview,
          learningStatus: uw.status,
        });
        return proficiency.score;
      });

      const weak = wordsWithProficiency.filter(
        (score) => score < proficiencyThreshold,
      );

      const critical = weak.filter((score) => score <= 30).length;
      const moderate = weak.filter((score) => score > 30 && score <= 50).length;
      const mild = weak.filter(
        (score) => score > 50 && score < proficiencyThreshold,
      ).length;

      return {
        total,
        weak: weak.length,
        critical,
        moderate,
        mild,
      };
    } catch (error) {
      this.logger.error(
        `获取薄弱词汇统计失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
      return { total: 0, weak: 0, critical: 0, moderate: 0, mild: 0 };
    }
  }
}
