import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AddWordToNotebookReqDto,
  AddWordToNotebookResDto,
  CreateNotebookReqDto,
  CreateNotebookResDto,
  CollectedWordItemDto,
  GetNotebookWordsReqDto,
  GetNotebookWordsResDto,
  GetNotebooksResDto,
  NotebookItemDto,
  UpdateCollectedWordReqDto,
  UpdateNotebookReqDto,
} from '@sylis/shared/dto';

import { ProficiencyCalculator } from '../../utils/proficiency-calculator';
import { VocabularyNotebookRepository } from './vocabulary-notebook.repository';
import { LearningRepository } from '../learning/learning.repository';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class VocabularyNotebookService {
  constructor(
    private readonly vocabularyNotebookRepository: VocabularyNotebookRepository,
    private readonly learningRepository: LearningRepository,
    private readonly logger: LoggerService,
  ) {}

  /**
   * 获取或创建用户学习记录
   */
  private async ensureUserLearning(userId: string) {
    let userLearning = await this.learningRepository.getUserLearning(userId);
    if (!userLearning) {
      userLearning = await this.learningRepository.createUserLearning(userId);
      // 自动创建默认生词本
      await this.vocabularyNotebookRepository.createNotebook({
        userLearningId: userLearning.id,
        name: '我的生词本',
        isDefault: true,
        coverColor: '#1677ff',
        icon: '📚',
      });
    }
    return userLearning;
  }

  /**
   * 创建生词本
   */
  async createNotebook(
    userId: string,
    dto: CreateNotebookReqDto,
  ): Promise<CreateNotebookResDto> {
    const userLearning = await this.ensureUserLearning(userId);

    const notebook = await this.vocabularyNotebookRepository.createNotebook({
      userLearningId: userLearning.id,
      name: dto.name,
      description: dto.description,
      coverColor: dto.coverColor || '#1677ff',
      icon: dto.icon || '📚',
      isDefault: false,
    });

    return {
      id: notebook.id,
      name: notebook.name,
      description: notebook.description || undefined,
      coverColor: notebook.coverColor || undefined,
      icon: notebook.icon || undefined,
      isDefault: notebook.isDefault,
      createdAt: notebook.createdAt,
    };
  }

  /**
   * 获取用户所有生词本
   */
  async getUserNotebooks(userId: string): Promise<GetNotebooksResDto> {
    const userLearning = await this.ensureUserLearning(userId);

    const notebooks = await this.vocabularyNotebookRepository.getUserNotebooks(
      userLearning.id,
    );

    const notebookItems: NotebookItemDto[] = notebooks.map((notebook) => ({
      id: notebook.id,
      name: notebook.name,
      description: notebook.description || undefined,
      coverColor: notebook.coverColor || undefined,
      icon: notebook.icon || undefined,
      isDefault: notebook.isDefault,
      wordCount: notebook._count.collectedWords,
      createdAt: notebook.createdAt,
      updatedAt: notebook.updatedAt,
    }));

    return {
      notebooks: notebookItems,
      total: notebookItems.length,
    };
  }

  /**
   * 获取生词本详情
   */
  async getNotebookById(
    userId: string,
    notebookId: string,
  ): Promise<NotebookItemDto> {
    const userLearning = await this.ensureUserLearning(userId);

    // 验证生词本所有权
    const isOwned =
      await this.vocabularyNotebookRepository.isNotebookOwnedByUser(
        notebookId,
        userLearning.id,
      );

    if (!isOwned) {
      throw new ForbiddenException('无权访问此生词本');
    }

    const notebook =
      await this.vocabularyNotebookRepository.getNotebookById(notebookId);

    if (!notebook) {
      throw new NotFoundException('生词本不存在');
    }

    return {
      id: notebook.id,
      name: notebook.name,
      description: notebook.description || undefined,
      coverColor: notebook.coverColor || undefined,
      icon: notebook.icon || undefined,
      isDefault: notebook.isDefault,
      wordCount: notebook._count.collectedWords,
      createdAt: notebook.createdAt,
      updatedAt: notebook.updatedAt,
    };
  }

  /**
   * 更新生词本
   */
  async updateNotebook(
    userId: string,
    notebookId: string,
    dto: UpdateNotebookReqDto,
  ) {
    const userLearning = await this.ensureUserLearning(userId);

    // 验证生词本所有权
    const isOwned =
      await this.vocabularyNotebookRepository.isNotebookOwnedByUser(
        notebookId,
        userLearning.id,
      );

    if (!isOwned) {
      throw new ForbiddenException('无权操作此生词本');
    }

    await this.vocabularyNotebookRepository.updateNotebook(notebookId, dto);

    return { success: true };
  }

  /**
   * 删除生词本
   */
  async deleteNotebook(userId: string, notebookId: string) {
    const userLearning = await this.ensureUserLearning(userId);

    const notebook =
      await this.vocabularyNotebookRepository.getNotebookById(notebookId);

    if (!notebook) {
      throw new NotFoundException('生词本不存在');
    }

    // 验证所有权
    const isOwned =
      await this.vocabularyNotebookRepository.isNotebookOwnedByUser(
        notebookId,
        userLearning.id,
      );

    if (!isOwned) {
      throw new ForbiddenException('无权删除此生词本');
    }

    // 不允许删除默认生词本
    if (notebook.isDefault) {
      throw new BadRequestException('不能删除默认生词本');
    }

    await this.vocabularyNotebookRepository.deleteNotebook(notebookId);

    return { success: true };
  }

  /**
   * 添加单词到生词本
   */
  async addWordToNotebook(
    userId: string,
    notebookId: string,
    dto: AddWordToNotebookReqDto,
  ): Promise<AddWordToNotebookResDto> {
    const userLearning = await this.ensureUserLearning(userId);

    // 验证生词本所有权
    const isOwned =
      await this.vocabularyNotebookRepository.isNotebookOwnedByUser(
        notebookId,
        userLearning.id,
      );

    if (!isOwned) {
      throw new ForbiddenException('无权操作此生词本');
    }

    // 检查单词是否已在生词本中
    const isWordInNotebook =
      await this.vocabularyNotebookRepository.isWordInNotebook(
        notebookId,
        dto.wordId,
      );

    if (isWordInNotebook) {
      throw new BadRequestException('该单词已在生词本中');
    }

    const collectedWord =
      await this.vocabularyNotebookRepository.addWordToNotebook({
        notebookId,
        wordId: dto.wordId,
        source: dto.source,
        context: dto.context,
        note: dto.note,
        tags: dto.tags,
      });

    return {
      success: true,
      collectedWordId: collectedWord.id,
    };
  }

  /**
   * 添加单词到默认生词本（快捷方式）
   */
  async addWordToDefaultNotebook(
    userId: string,
    dto: AddWordToNotebookReqDto,
  ): Promise<AddWordToNotebookResDto> {
    this.logger.log('添加单词到默认生词本', {
      userId,
      wordId: dto.wordId,
      source: dto.source,
    });

    const userLearning = await this.ensureUserLearning(userId);

    let defaultNotebook =
      await this.vocabularyNotebookRepository.getDefaultNotebook(
        userLearning.id,
      );

    // 如果没有默认生词本，自动创建一个
    if (!defaultNotebook) {
      this.logger.log('默认生词本不存在，自动创建', {
        userLearningId: userLearning.id,
      });

      defaultNotebook = await this.vocabularyNotebookRepository.createNotebook({
        userLearningId: userLearning.id,
        name: '我的生词本',
        isDefault: true,
        coverColor: '#1677ff',
        icon: '📚',
      });

      this.logger.log('默认生词本创建成功', {
        notebookId: defaultNotebook.id,
      });
    }

    // 检查单词是否已在生词本中
    const isWordInNotebook =
      await this.vocabularyNotebookRepository.isWordInNotebook(
        defaultNotebook.id,
        dto.wordId,
      );

    if (isWordInNotebook) {
      this.logger.warn('单词已在生词本中', {
        wordId: dto.wordId,
        notebookId: defaultNotebook.id,
      });
      throw new BadRequestException('该单词已在生词本中');
    }

    // 直接添加单词，跳过权限验证（因为是用户自己的默认生词本）
    const collectedWord =
      await this.vocabularyNotebookRepository.addWordToNotebook({
        notebookId: defaultNotebook.id,
        wordId: dto.wordId,
        source: dto.source,
        context: dto.context,
        note: dto.note,
        tags: dto.tags,
      });

    this.logger.log('单词添加到生词本成功', {
      collectedWordId: collectedWord.id,
      wordId: dto.wordId,
    });

    return {
      success: true,
      collectedWordId: collectedWord.id,
    };
  }

  /**
   * 获取生词本的单词列表
   */
  async getNotebookWords(
    userId: string,
    notebookId: string,
    dto: GetNotebookWordsReqDto,
  ): Promise<GetNotebookWordsResDto> {
    const userLearning = await this.ensureUserLearning(userId);

    // 验证生词本所有权
    const isOwned =
      await this.vocabularyNotebookRepository.isNotebookOwnedByUser(
        notebookId,
        userLearning.id,
      );

    if (!isOwned) {
      throw new ForbiddenException('无权访问此生词本');
    }

    const { items, total, page, limit } =
      await this.vocabularyNotebookRepository.getNotebookWords(
        notebookId,
        userLearning.id,
        {
          page: dto.page,
          limit: dto.limit,
          isMarkedAsLearned: dto.isMarkedAsLearned,
          source: dto.source,
        },
      );

    const words: CollectedWordItemDto[] = items.map((item) => {
      const userWord = item.word.userWords[0]; // 获取用户学习状态

      // 计算熟练度
      const proficiency = ProficiencyCalculator.calculateProficiency({
        reviewCount: item.reviewCount,
        errorCount: userWord?.errorCount || 0,
        lastReviewedAt: item.lastReviewedAt,
        learningStatus: userWord?.status || 'NEW',
      });

      // 计算难易度
      const difficulty = ProficiencyCalculator.calculateDifficulty({
        headword: item.word.headword,
        star: item.word.star,
        reviewCount: item.reviewCount,
        errorCount: userWord?.errorCount || 0,
      });

      // 计算正确率
      const accuracyRate = ProficiencyCalculator.calculateAccuracyRate(
        item.reviewCount,
        userWord?.errorCount || 0,
      );

      return {
        id: item.id,
        wordId: item.wordId,
        headword: item.word.headword,
        phonetic: item.word.usPhonetic || item.word.ukPhonetic || undefined,
        meanings: item.word.meanings.map((m) => ({
          partOfSpeech: m.partOfSpeech,
          meaningCn: m.meaningCn,
        })),
        source: item.source || undefined,
        context: item.context || undefined,
        note: item.note || undefined,
        tags: item.tags,
        isMarkedAsLearned: item.isMarkedAsLearned,
        reviewCount: item.reviewCount,
        addedAt: item.addedAt,
        lastReviewedAt: item.lastReviewedAt || undefined,
        proficiencyScore: proficiency.score,
        proficiencyLevel: proficiency.level,
        difficultyScore: difficulty.score,
        difficultyLevel: difficulty.level,
        accuracyRate,
        learningStatus: userWord?.status,
      };
    });

    return {
      words,
      total,
      page,
      limit,
    };
  }

  /**
   * 更新收藏单词信息
   */
  async updateCollectedWord(
    userId: string,
    notebookId: string,
    wordId: string,
    dto: UpdateCollectedWordReqDto,
  ) {
    const userLearning = await this.ensureUserLearning(userId);

    // 验证生词本所有权
    const isOwned =
      await this.vocabularyNotebookRepository.isNotebookOwnedByUser(
        notebookId,
        userLearning.id,
      );

    if (!isOwned) {
      throw new ForbiddenException('无权操作此生词本');
    }

    await this.vocabularyNotebookRepository.updateCollectedWord(
      notebookId,
      wordId,
      dto,
    );

    return { success: true };
  }

  /**
   * 从生词本移除单词
   */
  async removeWordFromNotebook(
    userId: string,
    notebookId: string,
    wordId: string,
  ) {
    const userLearning = await this.ensureUserLearning(userId);

    // 验证生词本所有权
    const isOwned =
      await this.vocabularyNotebookRepository.isNotebookOwnedByUser(
        notebookId,
        userLearning.id,
      );

    if (!isOwned) {
      throw new ForbiddenException('无权操作此生词本');
    }

    await this.vocabularyNotebookRepository.removeWordFromNotebook(
      notebookId,
      wordId,
    );

    return { success: true };
  }

  /**
   * 从默认生词本移除单词（快捷方式）
   */
  async removeWordFromDefaultNotebook(userId: string, wordId: string) {
    this.logger.log('从默认生词本移除单词', {
      userId,
      wordId,
    });

    const userLearning = await this.ensureUserLearning(userId);

    const defaultNotebook =
      await this.vocabularyNotebookRepository.getDefaultNotebook(
        userLearning.id,
      );

    if (!defaultNotebook) {
      this.logger.warn('默认生词本不存在', { userId });
      throw new NotFoundException('默认生词本不存在');
    }

    // 直接移除，无需权限验证（因为是用户自己的默认生词本）
    await this.vocabularyNotebookRepository.removeWordFromNotebook(
      defaultNotebook.id,
      wordId,
    );

    this.logger.log('从默认生词本移除单词成功', {
      wordId,
      notebookId: defaultNotebook.id,
    });

    return { success: true };
  }

  /**
   * 获取生词本统计信息
   */
  async getNotebookStats(userId: string, notebookId: string) {
    const userLearning = await this.ensureUserLearning(userId);

    // 验证生词本所有权
    const isOwned =
      await this.vocabularyNotebookRepository.isNotebookOwnedByUser(
        notebookId,
        userLearning.id,
      );

    if (!isOwned) {
      throw new ForbiddenException('无权访问此生词本');
    }

    return this.vocabularyNotebookRepository.getNotebookStats(notebookId);
  }
}
