import { Injectable } from '@nestjs/common';
import { QuizQuestionType, Word } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateChoiceQuizData {
  type: QuizQuestionType;
  wordId?: string;
  choiceQuestion: {
    answerWordId: string;
    options: {
      wordId: string;
    }[];
  };
}

export interface GetQuizzesParams {
  skip: number;
  take: number;
  type?: QuizQuestionType;
  wordId?: string;
}

@Injectable()
export class QuizChoiceRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createChoiceQuiz(data: CreateChoiceQuizData) {
    return this.prismaService.$transaction(async (tx) => {
      // 创建基础题目
      const baseQuestion = await tx.quizQuestion.create({
        data: {
          type: data.type,
          wordId: data.wordId,
        },
      });

      // 创建选择题详细信息
      const choiceQuestion = await tx.quizChoiceQuestion.create({
        data: {
          baseId: baseQuestion.id,
          answerWordId: data.choiceQuestion.answerWordId,
        },
      });

      // 创建选择题选项
      await tx.quizChoiceOption.createMany({
        data: data.choiceQuestion.options.map((option) => ({
          questionId: choiceQuestion.id,
          wordId: option.wordId,
        })),
      });

      return baseQuestion;
    });
  }

  async getQuizzes(params: GetQuizzesParams) {
    const where: any = {};

    if (params.type) {
      where.type = params.type;
    }

    if (params.wordId) {
      where.wordId = params.wordId;
    }

    const [quizzes, total] = await Promise.all([
      this.prismaService.quizQuestion.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: {
          word: {
            select: {
              id: true,
              headword: true,
              ukPhonetic: true,
              usPhonetic: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prismaService.quizQuestion.count({ where }),
    ]);

    return { quizzes, total };
  }

  async getQuizById(id: string) {
    return this.prismaService.quizQuestion.findUnique({
      where: { id },
      include: {
        word: {
          select: {
            id: true,
            headword: true,
            ukPhonetic: true,
            usPhonetic: true,
          },
        },
        choiceQuestion: {
          include: {
            options: {
              include: {
                word: {
                  select: {
                    id: true,
                    headword: true,
                    ukPhonetic: true,
                    usPhonetic: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
  }

  async getWordById(id: string): Promise<Word | null> {
    return this.prismaService.word.findUnique({
      where: { id },
    });
  }

  async getRandomWords(
    count: number,
    excludeIds: string[] = [],
  ): Promise<Word[]> {
    return this.prismaService.$queryRaw<Word[]>`
      SELECT * FROM "Word"
      WHERE id NOT IN (${excludeIds.map((id) => `'${id}'`).join(',') || "''"})
      ORDER BY RANDOM()
      LIMIT ${count}
    `;
  }

  async createQuizChoiceQuestion(baseId: string, answerWordId: string) {
    return this.prismaService.quizChoiceQuestion.create({
      data: {
        baseId,
        answerWordId,
      },
    });
  }

  async createQuizChoiceOptions(
    options: Array<{
      questionId: string;
      wordId: string;
    }>,
  ) {
    return this.prismaService.quizChoiceOption.createMany({
      data: options,
    });
  }

  async deleteQuiz(id: string) {
    return this.prismaService.$transaction(async (tx) => {
      const quiz = await tx.quizQuestion.findUnique({
        where: { id },
        include: { choiceQuestion: true },
      });

      if (!quiz) {
        return null;
      }

      if (quiz.choiceQuestion) {
        // 删除选择题选项
        await tx.quizChoiceOption.deleteMany({
          where: { questionId: quiz.choiceQuestion.id },
        });

        // 删除选择题详细信息
        await tx.quizChoiceQuestion.delete({
          where: { id: quiz.choiceQuestion.id },
        });
      }

      // 删除基础题目
      return tx.quizQuestion.delete({
        where: { id },
      });
    });
  }

  /**
   * 获取已存在的选择题
   */
  async getExistingChoiceQuizzes(wordIds: string[]) {
    if (wordIds.length === 0) return [];

    // 查找这些单词对应的选择题
    return this.prismaService.quizQuestion.findMany({
      where: {
        type: QuizQuestionType.CHOICE,
        wordId: {
          in: wordIds,
        },
      },
      include: {
        choiceQuestion: {
          include: {
            options: {
              include: {
                word: {
                  select: {
                    id: true,
                    headword: true,
                    ukPhonetic: true,
                    usPhonetic: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
  }

  /**
   * 根据单词文本查找单词
   */
  async findWordByHeadword(headword: string) {
    return this.prismaService.word.findFirst({
      where: {
        headword: {
          equals: headword,
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * 批量根据单词文本查找单词
   */
  async findWordsByHeadwords(headwords: string[]) {
    return this.prismaService.word.findMany({
      where: {
        headword: {
          in: headwords,
          mode: 'insensitive',
        },
      },
    });
  }
}
