import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  CompleteTestReqDto,
  CompleteTestResDto,
} from './dto/complete-test.dto';
import { GetTestDetailResDto } from './dto/get-test-detail.dto';
import {
  GetTestHistoryReqDto,
  GetTestHistoryResDto,
  TestHistoryItemDto,
} from './dto/get-test-history.dto';
import {
  StartTestReqDto,
  StartTestResDto,
  TestQuestionDto,
} from './dto/start-test.dto';
import { LearningRepository } from '../learning/learning.repository';
import { LoggerService } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  QuizChoiceService,
  WordWithMeanings,
} from '../quiz/quiz-choice.service';
import { WordsService } from '../words/words.service';

@Injectable()
export class VocabularyTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learningRepository: LearningRepository,
    private readonly logger: LoggerService,
    private readonly quizChoiceService: QuizChoiceService,
    private readonly wordsService: WordsService,
  ) {}

  /**
   * 获取或创建用户学习记录
   */
  private async ensureUserLearning(userId: string) {
    let userLearning = await this.learningRepository.getUserLearning(userId);
    if (!userLearning) {
      userLearning = await this.learningRepository.createUserLearning(userId);
    }
    return userLearning;
  }

  /**
   * 生成测试题目
   * 固定使用相同的10个单词，避免每次随机
   */
  private async generateTestQuestions(
    count: number = 10,
  ): Promise<TestQuestionDto[]> {
    try {
      this.logger.log(`开始生成测试题目，固定使用${count}道题`);

      // 固定从数据库获取前N个单词（不随机，保证每次测试使用相同的单词）
      // 优先选择有星级的单词，如果没有则选择所有单词
      let wordIds = await this.prisma.word.findMany({
        where: {
          star: { in: [1, 2, 3] }, // 优先选择1-3星级的单词
          meanings: {
            some: {}, // 确保有释义
          },
        },
        select: {
          id: true,
          star: true,
        },
        orderBy: {
          id: 'asc', // 固定排序，确保每次获取相同的单词
        },
        take: count, // 只取需要的数量
      });

      this.logger.log(`查询到 star 1-3 的单词: ${wordIds.length}个`);

      // 如果没有找到足够的单词，尝试不限制星级
      if (wordIds.length < count) {
        this.logger.warn(
          `星级1-3的单词不足，尝试查询所有单词。当前: ${wordIds.length}个`,
        );
        wordIds = await this.prisma.word.findMany({
          where: {
            meanings: {
              some: {}, // 确保有释义
            },
          },
          select: {
            id: true,
            star: true,
          },
          orderBy: {
            id: 'asc', // 固定排序
          },
          take: count,
        });
        this.logger.log(`查询所有单词: ${wordIds.length}个`);
      }

      if (wordIds.length < count) {
        this.logger.error(
          `词库单词数量严重不足，需要${count}个，实际${wordIds.length}个`,
        );
        return [];
      }

      this.logger.log(`固定选择了${wordIds.length}个单词ID`);

      // 批量获取完整的单词详情
      const words = await this.wordsService.getWordDetailsByIds(
        wordIds.map((w) => w.id),
      );

      this.logger.log(`获取到完整单词详情: ${words.length}个`);

      if (words.length === 0) {
        this.logger.error('获取单词详情返回空数组');
        return [];
      }

      // 转换为QuizService需要的格式
      const wordsWithMeanings: WordWithMeanings[] = words.map((word) => ({
        id: word.id,
        headword: word.headword,
        meanings: word.meanings.map((m, index) => ({
          id: `${word.id}-meaning-${index}`, // 生成临时ID
          partOfSpeech: m.partOfSpeech,
          meaningCn: m.meaningCn,
          meaningEn: '', // WordDetailResDto 没有 meaningEn
        })),
      }));

      // 调用Quiz模块生成选择题
      this.logger.log(
        `调用QuizChoiceService生成选择题，单词数: ${wordsWithMeanings.length}`,
      );
      const quizMap =
        await this.quizChoiceService.ensureChoiceQuizzesExist(
          wordsWithMeanings,
        );

      this.logger.log(`QuizChoiceService返回的选择题数量: ${quizMap.size}`);

      // 转换为TestQuestionDto格式（包含完整的 QuizChoiceDataDto）
      const questions: TestQuestionDto[] = [];
      for (const word of words) {
        const quizData = quizMap.get(word.id);
        if (quizData && quizData.options.length > 0) {
          // 根据单词星级判断难度（如果没有star则默认为medium）
          const wordStar = wordIds.find((w) => w.id === word.id)?.star;
          let difficulty = 'medium';
          if (wordStar === 1) difficulty = 'easy';
          else if (wordStar && wordStar >= 3) difficulty = 'hard';

          // 返回完整的 QuizChoiceDataDto 和单词信息
          questions.push({
            word: {
              id: word.id,
              headword: word.headword,
              usPhonetic: word.usPhonetic || undefined,
              ukPhonetic: word.ukPhonetic || undefined,
            },
            quizData,
            difficulty,
          });

          this.logger.log(
            `✓ 生成题目: ${word.headword}, 选项数: ${quizData.options.length}`,
          );
        } else {
          this.logger.warn(
            `✗ 单词 ${word.headword}(${word.id}) 没有生成选择题或选项为空`,
          );
        }
      }

      this.logger.log(
        `✅ 最终成功生成${questions.length}道测试题（需要${count}道）`,
      );

      // 确保返回固定数量的题目
      if (questions.length < count) {
        this.logger.error(
          `生成的题目数量不足：需要${count}道，实际${questions.length}道`,
        );
        return [];
      }

      // 返回固定前N道题
      return questions.slice(0, count);
    } catch (error) {
      this.logger.error('生成测试题目失败:', error);
      // 如果失败，返回空数组
      return [];
    }
  }

  /**
   * 计算测试结果
   * 基于词汇量测试理论的科学算法
   */
  private calculateTestResult(answers: CompleteTestReqDto['answers']) {
    let correctCount = 0;
    let totalTimeSpent = 0;

    // 按难度分组统计（基于difficulty字段）
    const difficultyStats = {
      easy: { correct: 0, total: 0, vocabularyRange: 3000 }, // 高频词 (star 1): 3000词
      medium: { correct: 0, total: 0, vocabularyRange: 5000 }, // 中频词 (star 2): 5000词
      hard: { correct: 0, total: 0, vocabularyRange: 8000 }, // 低频词 (star 3+): 8000词
    };

    answers.forEach((answer) => {
      const isCorrect = answer.selectedWordId === answer.answerWordId;
      if (isCorrect) {
        correctCount++;
      }
      totalTimeSpent += answer.timeSpent;

      // 根据难度分类统计
      const difficulty = answer.difficulty as keyof typeof difficultyStats;
      if (difficultyStats[difficulty]) {
        difficultyStats[difficulty].total++;
        if (isCorrect) {
          difficultyStats[difficulty].correct++;
        }
      }
    });

    const totalCount = answers.length;
    const score = Math.round((correctCount / totalCount) * 100);

    // 词汇量估算公式（分层估算法）
    // 估计词汇量 = Σ(各级别正确率 × 该级别词库量)
    let estimatedVocabulary = 0;

    Object.values(difficultyStats).forEach((stat) => {
      if (stat.total > 0) {
        const accuracyRate = stat.correct / stat.total;
        estimatedVocabulary += Math.round(accuracyRate * stat.vocabularyRange);
      }
    });

    // 如果没有按难度分类的数据，使用简单估算（向下兼容）
    if (estimatedVocabulary === 0) {
      const accuracyRate = correctCount / totalCount;
      estimatedVocabulary = Math.round(accuracyRate * 5000); // 假设总词库5000词
    }

    // 根据词汇量确定水平等级（参考CEFR标准）
    let level = '';
    if (estimatedVocabulary >= 8000) {
      level = 'C1-C2 (精通)';
    } else if (estimatedVocabulary >= 5000) {
      level = 'B2 (中高级)';
    } else if (estimatedVocabulary >= 3000) {
      level = 'B1 (中级)';
    } else if (estimatedVocabulary >= 1500) {
      level = 'A2 (初中级)';
    } else if (estimatedVocabulary >= 500) {
      level = 'A1 (初级)';
    } else {
      level = 'Pre-A1 (入门)';
    }

    this.logger.log('测试结果计算完成', {
      score,
      correctCount,
      totalCount,
      difficultyStats,
      estimatedVocabulary,
      level,
    });

    return {
      score,
      correctCount,
      totalCount,
      level,
      estimatedVocabulary,
      timeSpent: totalTimeSpent,
    };
  }

  /**
   * 开始测试
   */
  async startTest(
    userId: string,
    dto: StartTestReqDto,
  ): Promise<StartTestResDto> {
    this.logger.log('开始词汇量测试', {
      userId,
      questionCount: dto.questionCount,
    });

    const userLearning = await this.ensureUserLearning(userId);

    // 生成测试题目
    const questionCount = dto.questionCount || 10;
    const questions = await this.generateTestQuestions(questionCount);

    // 检查是否成功生成题目
    if (questions.length === 0) {
      throw new BadRequestException(
        '词库中没有足够的单词，无法生成测试题目。请先导入单词数据。',
      );
    }

    // 创建测试记录（初始状态）
    const test = await this.prisma.vocabularyTest.create({
      data: {
        userLearningId: userLearning.id,
        score: 0,
        correctCount: 0,
        totalCount: questions.length,
        level: '',
        estimatedVocabulary: 0,
        timeSpent: 0,
        isCompleted: false,
      },
    });

    this.logger.log('测试创建成功', { testId: test.id });

    return {
      testId: test.id,
      questions,
      totalCount: questions.length,
      timeLimit: 30, // 每题30秒
    };
  }

  /**
   * 完成测试
   */
  async completeTest(
    userId: string,
    testId: string,
    dto: CompleteTestReqDto,
  ): Promise<CompleteTestResDto> {
    this.logger.log('完成词汇量测试', {
      userId,
      testId,
      answerCount: dto.answers.length,
    });

    const userLearning = await this.ensureUserLearning(userId);

    // 验证测试是否存在且属于该用户
    const test = await this.prisma.vocabularyTest.findUnique({
      where: { id: testId },
    });

    if (!test) {
      throw new NotFoundException('测试不存在');
    }

    if (test.userLearningId !== userLearning.id) {
      throw new BadRequestException('无权操作此测试');
    }

    if (test.isCompleted) {
      throw new BadRequestException('测试已完成');
    }

    // 计算测试结果
    const result = this.calculateTestResult(dto.answers);

    // 更新测试记录
    const updatedTest = await this.prisma.vocabularyTest.update({
      where: { id: testId },
      data: {
        score: result.score,
        correctCount: result.correctCount,
        totalCount: result.totalCount,
        level: result.level,
        estimatedVocabulary: result.estimatedVocabulary,
        timeSpent: result.timeSpent,
        isCompleted: true,
        completedAt: new Date(),
        // 同时创建答题记录
        testAnswers: {
          create: dto.answers.map((answer) => ({
            questionWord: answer.questionWord,
            options: [], // 存储为空数组，因为我们有完整的quiz数据
            userAnswer: -1, // 用-1表示基于wordId的选择
            correctAnswer: -1, // 用-1表示基于wordId的选择
            isCorrect: answer.selectedWordId === answer.answerWordId,
            difficulty: answer.difficulty,
            timeSpent: answer.timeSpent,
          })),
        },
      },
    });

    this.logger.log('测试完成', { testId, score: result.score });

    return {
      testId: updatedTest.id,
      score: result.score,
      correctCount: result.correctCount,
      totalCount: result.totalCount,
      level: result.level,
      estimatedVocabulary: result.estimatedVocabulary,
      timeSpent: result.timeSpent,
      completedAt: updatedTest.completedAt!,
    };
  }

  /**
   * 获取测试历史
   */
  async getTestHistory(
    userId: string,
    dto: GetTestHistoryReqDto,
  ): Promise<GetTestHistoryResDto> {
    const userLearning = await this.ensureUserLearning(userId);

    const page = dto.page || 1;
    const limit = dto.limit || 10;
    const skip = (page - 1) * limit;

    // 查询测试历史
    const [tests, total] = await Promise.all([
      this.prisma.vocabularyTest.findMany({
        where: {
          userLearningId: userLearning.id,
          isCompleted: true,
        },
        orderBy: {
          completedAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.vocabularyTest.count({
        where: {
          userLearningId: userLearning.id,
          isCompleted: true,
        },
      }),
    ]);

    const testItems: TestHistoryItemDto[] = tests.map((test) => ({
      id: test.id,
      score: test.score,
      correctCount: test.correctCount,
      totalCount: test.totalCount,
      level: test.level,
      estimatedVocabulary: test.estimatedVocabulary,
      timeSpent: test.timeSpent,
      completedAt: test.completedAt!,
    }));

    return {
      tests: testItems,
      total,
      page,
      limit,
    };
  }

  /**
   * 获取测试详情
   */
  async getTestDetail(
    userId: string,
    testId: string,
  ): Promise<GetTestDetailResDto> {
    const userLearning = await this.ensureUserLearning(userId);

    const test = await this.prisma.vocabularyTest.findUnique({
      where: { id: testId },
      include: {
        testAnswers: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!test) {
      throw new NotFoundException('测试不存在');
    }

    if (test.userLearningId !== userLearning.id) {
      throw new BadRequestException('无权访问此测试');
    }

    if (!test.isCompleted) {
      throw new BadRequestException('测试未完成');
    }

    return {
      id: test.id,
      score: test.score,
      correctCount: test.correctCount,
      totalCount: test.totalCount,
      level: test.level,
      estimatedVocabulary: test.estimatedVocabulary,
      timeSpent: test.timeSpent,
      startedAt: test.startedAt,
      completedAt: test.completedAt!,
      answers: test.testAnswers.map((answer) => ({
        questionWord: answer.questionWord,
        options: answer.options,
        userAnswer: answer.userAnswer,
        correctAnswer: answer.correctAnswer,
        isCorrect: answer.isCorrect,
        difficulty: answer.difficulty,
        timeSpent: answer.timeSpent,
      })),
    };
  }

  /**
   * 删除测试记录
   */
  async deleteTest(userId: string, testId: string) {
    const userLearning = await this.ensureUserLearning(userId);

    const test = await this.prisma.vocabularyTest.findUnique({
      where: { id: testId },
    });

    if (!test) {
      throw new NotFoundException('测试不存在');
    }

    if (test.userLearningId !== userLearning.id) {
      throw new BadRequestException('无权删除此测试');
    }

    await this.prisma.vocabularyTest.delete({
      where: { id: testId },
    });

    this.logger.log('测试删除成功', { testId });

    return { success: true };
  }
}
