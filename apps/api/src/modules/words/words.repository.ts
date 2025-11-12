import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WordsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async searchWords(keyword: string, limit: number) {
    const words = await this.prismaService.word.findMany({
      where: {
        headword: {
          contains: keyword,
          mode: 'insensitive', // 不区分大小写
        },
      },
      include: {
        meanings: {
          take: 1, // 只取第一个词义
          orderBy: {
            id: 'asc',
          },
        },
      },
      take: limit * 2, // 获取更多结果用于排序
      orderBy: {
        headword: 'asc',
      },
    });

    // 对结果进行智能排序
    const sortedWords = words
      .map((word) => ({
        id: word.id,
        headword: word.headword,
        partOfSpeech: word.meanings[0]?.partOfSpeech,
        translation: word.meanings[0]?.meaningCn || '',
      }))
      .sort((a, b) => {
        const keywordLower = keyword.toLowerCase();
        const aWord = a.headword.toLowerCase();
        const bWord = b.headword.toLowerCase();

        // 1. 精确匹配优先级最高
        if (aWord === keywordLower && bWord !== keywordLower) return -1;
        if (bWord === keywordLower && aWord !== keywordLower) return 1;

        // 2. 开头匹配优先级第二
        const aStartsWith = aWord.startsWith(keywordLower);
        const bStartsWith = bWord.startsWith(keywordLower);
        if (aStartsWith && !bStartsWith) return -1;
        if (bStartsWith && !aStartsWith) return 1;

        // 3. 开头匹配时，按单词长度排序（短的优先）
        if (aStartsWith && bStartsWith) {
          return a.headword.length - b.headword.length;
        }

        // 4. 包含匹配时，按单词长度排序（短的优先）
        return a.headword.length - b.headword.length;
      })
      .slice(0, limit); // 最终限制返回数量

    return sortedWords;
  }

  /**
   * 批量获取单词详情
   */
  async getWordDetailsByIds(wordIds: string[]) {
    if (wordIds.length === 0) return [];

    const words = await this.prismaService.word.findMany({
      where: { id: { in: wordIds } },
      include: {
        meanings: {
          include: {
            synonyms: true,
          },
        },
        exampleSentences: true,
        realExamSentences: true,
        phrases: true,
        wordRelationsTo: {
          include: {
            word: {
              select: {
                headword: true,
                meanings: {
                  select: {
                    meaningCn: true,
                  },
                  take: 1,
                },
              },
            },
          },
        },
        wordBooks: {
          include: {
            book: true,
          },
        },
      },
    });

    // 收集所有近义词文本
    const synonymTexts = new Set<string>();
    words.forEach((word) => {
      word.meanings.forEach((meaning) => {
        meaning.synonyms.forEach((synonym) => {
          synonymTexts.add(synonym.synonymText);
        });
      });
    });

    // 查询近义词单词的详细信息
    const synonymWordMap = new Map<
      string,
      { partOfSpeech: string; meaningCn: string }
    >();

    if (synonymTexts.size > 0) {
      const synonymWords = await this.prismaService.word.findMany({
        where: {
          headword: {
            in: Array.from(synonymTexts),
          },
        },
        include: {
          meanings: {
            select: {
              partOfSpeech: true,
              meaningCn: true,
            },
            take: 1,
          },
        },
      });

      synonymWords.forEach((word) => {
        if (word.meanings.length > 0) {
          synonymWordMap.set(word.headword, {
            partOfSpeech: word.meanings[0].partOfSpeech,
            meaningCn: word.meanings[0].meaningCn,
          });
        }
      });
    }

    // 真题例句级别
    const realExamLevels = ['CET4', 'CET6', '考研'];

    // 允许的考试标签
    const allowedExamTags = ['CET4', 'CET6', '考研', '雅思', 'TOEFL'];

    // 转换为前端需要的格式
    return words.map((word) => {
      // 从所有关联的书籍中获取标签，只保留指定的考试标签
      const allTags = new Set<string>();
      word.wordBooks.forEach((wordBook) => {
        wordBook.book.tags.forEach((tag) => {
          if (allowedExamTags.includes(tag)) {
            allTags.add(tag);
          }
        });
      });

      // 获取真题例句
      const realExamSentences = word.realExamSentences
        .filter((sentence) => realExamLevels.includes(sentence.level))
        .map((sentence) => ({
          id: sentence.id,
          sentenceEn: sentence.sentenceEn
            .replace(/^\.\.\.|\.\.\.$/g, '')
            .trim(),
          sentenceCn:
            sentence.sentenceCn?.replace(/^\.\.\.|\.\.\.$/g, '').trim() ??
            undefined,
          paper: sentence.paper,
          level: sentence.level,
          year: sentence.year,
          examType: sentence.examType,
        }))
        .sort((a, b) => {
          if (a.sentenceCn && !b.sentenceCn) return -1;
          if (!a.sentenceCn && b.sentenceCn) return 1;
          return 0;
        });

      // 构建近义词列表
      const synonymsList: {
        id: string;
        partOfSpeech: string;
        meaningCn: string;
        synonymText: string;
      }[] = [];

      word.meanings.forEach((meaning) => {
        meaning.synonyms.forEach((synonym) => {
          const synonymInfo = synonymWordMap.get(synonym.synonymText);
          if (synonymInfo) {
            synonymsList.push({
              id: synonym.id,
              partOfSpeech: synonymInfo.partOfSpeech,
              meaningCn: synonymInfo.meaningCn,
              synonymText: synonym.synonymText,
            });
          }
        });
      });

      return {
        id: word.id,
        headword: word.headword,
        usPhonetic: word.usPhonetic,
        ukPhonetic: word.ukPhonetic,
        meanings: word.meanings.map((meaning) => ({
          partOfSpeech: meaning.partOfSpeech,
          meaningCn: meaning.meaningCn,
        })),
        exampleSentences: word.exampleSentences.map((sentence) => ({
          id: sentence.id,
          sentenceEn: sentence.sentenceEn,
          sentenceCn: sentence.sentenceCn,
          headword: word.headword,
        })),
        examTags: Array.from(allTags),
        realExamSentences,
        phrases: word.phrases.map((phrase) => ({
          id: phrase.id,
          phraseText: phrase.phraseText,
          phraseCn: phrase.phraseCn,
        })),
        synonyms: synonymsList,
        wordRelations: word.wordRelationsTo.map((relation) => ({
          id: relation.id,
          relatedWord: relation.word.headword,
          meaningCn: relation.word.meanings[0]?.meaningCn || '',
          pos: relation.pos ?? undefined,
        })),
      };
    });
  }

  /**
   * 根据单词ID或单词文本获取单词详情
   * @param wordOrId - 单词文本或单词ID（UUID）
   */
  async getWordDetail(wordOrId: string) {
    // 判断是UUID还是单词文本（UUID格式：8-4-4-4-12）
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        wordOrId,
      );

    if (isUUID) {
      // 按ID查询
      const results = await this.getWordDetailsByIds([wordOrId]);
      if (results.length === 0) {
        throw new Error('单词不存在');
      }
      return results[0];
    } else {
      // 按单词文本查询
      const word = await this.prismaService.word.findFirst({
        where: { headword: wordOrId.toLowerCase() },
        select: { id: true },
      });

      if (!word) {
        throw new Error('单词不存在');
      }

      // 使用批量查询方法获取完整详情
      const results = await this.getWordDetailsByIds([word.id]);
      return results[0];
    }
  }
}
