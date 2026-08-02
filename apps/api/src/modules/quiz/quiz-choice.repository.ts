import { Injectable } from '@nestjs/common';
import { QuizQuestionType, Word } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { projectWordContent, WORD_CONTENT_INCLUDE } from '../words/word-content';

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
          word: { include: WORD_CONTENT_INCLUDE },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prismaService.quizQuestion.count({ where }),
    ]);

    return { quizzes: (quizzes as any[]).map((quiz) => ({ ...quiz, word: quiz.word ? projectWordContent(quiz.word) : null })), total };
  }

  async getQuizById(id: string) {
    const result: any = await this.prismaService.quizQuestion.findUnique({
      where: { id },
      include: {
        word: { include: WORD_CONTENT_INCLUDE },
        choiceQuestion: {
          include: {
            options: {
              include: {
                word: { include: WORD_CONTENT_INCLUDE },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    } as any);
    if (result?.word) (result as any).word = projectWordContent((result as any).word);
    if ((result as any)?.choiceQuestion) {
      (result as any).choiceQuestion.options = (result as any).choiceQuestion.options.map((option: any) => ({ ...option, word: projectWordContent(option.word) }));
    }
    return result;
  }

  async getWordById(id: string): Promise<Word | null> {
    return this.prismaService.word.findUnique({
      where: { id },
    });
  }

  async getRandomWords(
    count: number,
    excludeIds: string[] = [],
  ): Promise<any[]> {
    // 先获取总数
    const totalCount = await this.prismaService.word.count({
      where: {
        id: {
          notIn: excludeIds.length > 0 ? excludeIds : undefined,
        },
        lemmaLexemes: { some: { senses: { some: {} } } },
      },
    });

    if (totalCount === 0) {
      return [];
    }

    // 随机跳过一些记录
    const skip = Math.max(
      0,
      Math.floor(Math.random() * Math.max(1, totalCount - count)),
    );

    return this.prismaService.word.findMany({
      where: {
        id: {
          notIn: excludeIds.length > 0 ? excludeIds : undefined,
        },
        lemmaLexemes: { some: { senses: { some: {} } } },
      },
      include: WORD_CONTENT_INCLUDE,
      skip,
      take: count,
    } as any).then((words: any[]) => words.map((word) => {
      const projected = projectWordContent(word);
      return { id: projected.id, headword: projected.headword, meanings: projected.meanings.slice(0, 1) };
    }));
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
                    include: WORD_CONTENT_INCLUDE,
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    } as any).then((quizzes: any[]) => quizzes.map((quiz) => ({ ...quiz, choiceQuestion: quiz.choiceQuestion ? { ...quiz.choiceQuestion, options: quiz.choiceQuestion.options.map((option: any) => ({ ...option, word: projectWordContent(option.word) })) } : null })));
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
