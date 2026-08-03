import { Injectable } from '@nestjs/common';

import { projectWordContent, WORD_CONTENT_INCLUDE } from './word-content';
import { PrismaService } from '../prisma/prisma.service';

const normalizeDictionaryText = (value: string) =>
  value.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n').trim();

@Injectable()
export class WordsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async searchWords(keyword: string, limit: number) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const words = await this.prismaService.word.findMany({
      where: {
        OR: [
          { headword: { contains: keyword, mode: 'insensitive' } },
          { lexicalForms: { some: { normalizedForm: { contains: normalizedKeyword } } } },
        ],
      },
      include: WORD_CONTENT_INCLUDE,
      take: Math.max(limit * 2, limit),
      orderBy: { headword: 'asc' },
    } as any);
    return words
      .map((word: any) => {
        const projected = projectWordContent(word);
        return {
          id: projected.id,
          headword: projected.headword,
          partOfSpeech: projected.meanings[0]?.partOfSpeech,
          translation: normalizeDictionaryText(projected.meanings[0]?.meaningCn || projected.meanings[0]?.meaningEn || ''),
        };
      })
      .sort((a, b) => {
        const aWord = a.headword.toLowerCase();
        const bWord = b.headword.toLowerCase();
        if (aWord === normalizedKeyword && bWord !== normalizedKeyword) return -1;
        if (bWord === normalizedKeyword && aWord !== normalizedKeyword) return 1;
        const aStarts = aWord.startsWith(normalizedKeyword);
        const bStarts = bWord.startsWith(normalizedKeyword);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.headword.length - b.headword.length || aWord.localeCompare(bWord);
      })
      .slice(0, limit);
  }

  async getWordDetailsByIds(wordIds: string[]) {
    if (wordIds.length === 0) return [];
    const words = await this.prismaService.word.findMany({
      where: { id: { in: wordIds } },
      include: WORD_CONTENT_INCLUDE,
    } as any);
    const projected = words.map((word: any) => projectWordContent(word));
    const order = new Map(wordIds.map((id, index) => [id, index]));
    return projected.sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async getWordDetail(wordOrId: string) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wordOrId);
    const word = await this.prismaService.word.findFirst({
      where: isUUID ? { id: wordOrId } : { normalizedHeadword: wordOrId.trim().toLowerCase() },
      include: WORD_CONTENT_INCLUDE,
    } as any);
    if (!word) throw new Error('单词不存在');
    return projectWordContent(word);
  }
}
