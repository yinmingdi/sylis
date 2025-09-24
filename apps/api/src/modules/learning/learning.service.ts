import { BadRequestException, Injectable } from '@nestjs/common';
import { Book } from '@prisma/client';

import { AddBookReqDto } from './dto/addBook.dto';
import { BookDetailResDto } from './dto/book-detail.dto';
import { GetCurrentBookResDto } from './dto/currentBook.dto';
import { LearningStatsResDto } from './dto/learning-stats.dto';
import { LearningRepository } from './learning.repository';
import { AddUserLearning } from './types';

@Injectable()
export class LearningService {
  constructor(private readonly learningRepository: LearningRepository) {}

  async addBook(dto: AddBookReqDto, userId: string) {
    const userLearning = await this.learningRepository.getUserLearning(userId);

    if (!userLearning) {
      throw new BadRequestException('用户学习记录不存在');
    }

    const params: AddUserLearning = {
      ...dto,
      userLearningId: userLearning.id,
    };

    return this.learningRepository.addBook(params);
  }

  async getUserLearning(userId: string) {
    return this.learningRepository.getUserLearning(userId);
  }

  async getBookInfo(bookId: string) {
    return await this.learningRepository.getBookInfo(bookId);
  }

  async getUserBook(userId: string, bookId: string) {
    return await this.learningRepository.getUserBook(userId, bookId);
  }

  async getCurrentBook(userId: string): Promise<GetCurrentBookResDto> {
    // 目标考研日期（如2024-12-21）
    const targetDate = new Date('2024-12-21');
    const today = new Date();
    const diffTime = targetDate.getTime() - today.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // 获取用户学习记录
    const userLearning = await this.getUserLearning(userId);
    let currentBook: Book | null = null;
    let progress = 0;
    let newWords = 0;
    let totalWords = 0;
    if (userLearning && userLearning.currentBookId) {
      // 查询当前词书信息
      currentBook = await this.getBookInfo(userLearning.currentBookId);
      // 查询用户该词书的学习进度
      const userBook = await this.getUserBook(
        userId,
        userLearning.currentBookId,
      );
      if (userBook && currentBook) {
        newWords = userBook.dailyNewWords || 0;
        totalWords = currentBook.wordNum || 0;
        // 统计已学单词数
        const learnedWordsNum =
          await this.learningRepository.getLearnedWordsCount(
            userLearning.id,
            userLearning.currentBookId,
          );
        progress = totalWords
          ? Math.round((learnedWordsNum / totalWords) * 100)
          : 0;
      }
    }
    return {
      daysLeft,
      book: currentBook
        ? {
            id: currentBook.id,
            name: currentBook.name,
            coverUrl: currentBook.coverUrl,
            wordNum: currentBook.wordNum,
          }
        : null,
      progress,
      newWords,
      totalWords,
    };
  }

  async getLearningStats(userId: string): Promise<LearningStatsResDto> {
    // 获取用户学习记录
    const userLearning = await this.getUserLearning(userId);

    if (!userLearning) {
      throw new BadRequestException('用户学习记录不存在');
    }

    // 并行获取所有统计数据
    const [checkInDays, newWordsLearned, reviewWords, learningProgress] =
      await Promise.all([
        this.learningRepository.getCheckInDays(userLearning.id),
        this.learningRepository.getNewWordsLearned(userLearning.id),
        this.learningRepository.getReviewWords(userLearning.id),
        userLearning.currentBookId
          ? this.learningRepository.getLearningProgress(
              userLearning.id,
              userLearning.currentBookId,
            )
          : Promise.resolve(0),
      ]);

    return {
      checkInDays,
      learningProgress,
      newWordsLearned,
      reviewWords,
    };
  }

  async getTodayProgress(
    userId: string,
  ): Promise<{ completed: number; total: number }> {
    // 获取用户学习记录
    const userLearning = await this.getUserLearning(userId);

    if (!userLearning) {
      throw new BadRequestException('用户学习记录不存在');
    }

    return this.learningRepository.getTodayProgress(userLearning.id);
  }

  async getBookDetail(
    userId: string,
    bookId: string,
  ): Promise<BookDetailResDto> {
    // 获取书籍信息
    const book = await this.getBookInfo(bookId);
    if (!book) {
      throw new BadRequestException('书籍不存在');
    }

    // 获取用户学习记录
    const userLearning = await this.getUserLearning(userId);
    if (!userLearning) {
      throw new BadRequestException('用户学习记录不存在');
    }

    // 获取用户对该书籍的学习设置
    const userBook = await this.getUserBook(userId, bookId);

    return {
      id: book.id,
      name: book.name,
      coverUrl: book.coverUrl,
      introduce: book.introduce,
      wordNum: book.wordNum || 0,
      tags: book.tags,
      userBook: userBook
        ? {
            dailyNewWords: userBook.dailyNewWords,
            dailyReviewWords: userBook.dailyReviewWords,
          }
        : null,
    };
  }
}
