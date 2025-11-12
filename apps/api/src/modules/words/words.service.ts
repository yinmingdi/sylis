import { Injectable, Logger } from '@nestjs/common';

import { AIService } from '../ai/ai.service';
import { SearchWordReqDto, SearchWordResDto } from './dto/search-word.dto';
import { TranslateTextReqDto } from './dto/translate.dto';
import { WordDetailResDto } from './dto/word-detail.dto';
import { WordsRepository } from './words.repository';

@Injectable()
export class WordsService {
  private readonly logger = new Logger(WordsService.name);

  constructor(
    private readonly wordsRepository: WordsRepository,
    private readonly aiService: AIService,
  ) {}

  async searchWords(dto: SearchWordReqDto): Promise<SearchWordResDto[]> {
    return this.wordsRepository.searchWords(dto.keyword, dto.limit || 20);
  }

  async getWordDetail(wordOrId: string): Promise<WordDetailResDto> {
    return this.wordsRepository.getWordDetail(wordOrId);
  }

  async getWordDetailsByIds(ids: string[]): Promise<WordDetailResDto[]> {
    return this.wordsRepository.getWordDetailsByIds(ids);
  }

  /**
   * 翻译文字
   * 先尝试使用 getWordDetail 方法从数据库获取
   * 如果数据库中没有，使用AI翻译
   * 返回 WordDetailResDto 格式
   */
  async translateText(dto: TranslateTextReqDto): Promise<WordDetailResDto> {
    const { text } = dto;

    // 防御性检查
    if (!text || typeof text !== 'string') {
      throw new Error('翻译文字不能为空');
    }

    // 先尝试从数据库获取（使用 getWordDetail 方法）
    try {
      const wordDetail = await this.getWordDetail(text);
      if (wordDetail && wordDetail.meanings && wordDetail.meanings.length > 0) {
        return wordDetail;
      }
    } catch {
      // 数据库中没有该单词，继续使用AI翻译
      this.logger.debug(`文本 "${text}" 不在数据库中，使用AI翻译`);
    }

    // 使用AI翻译
    try {
      const client = this.aiService.getClient();

      // 判断是否为句子（包含空格且可能包含标点）
      const isSentence = text.includes(' ') || /[.!?;]/.test(text);

      const systemPrompt = isSentence
        ? '你是一个专业的英语翻译助手。请将用户输入的英文句子或短语翻译成中文，翻译要准确、自然、流畅。只返回中文翻译结果，不需要其他说明。'
        : '你是一个专业的英语词典助手。请分析用户输入的英文单词或词组，如果是单词或词组，请提供详细的中文释义（包括词性和含义）。如果是句子，请提供完整的中文翻译。格式要求：如果是单词或词组，每行一个词性和释义，格式为"词性. 中文含义"（例如："n. 名词含义\nv. 动词含义"）。如果是句子，直接返回翻译结果。如果可能的话，可以提供音标信息（美式：/xxx/，英式：/xxx/），但不要强行填写。';

      const response = await client.chat.completions.create({
        model: this.aiService.getModel(),
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `请翻译或解释以下文本：${text}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      });

      const aiResponse =
        response.choices[0]?.message?.content?.trim() || '翻译失败';

      // 解析AI返回的内容
      const result = this.parseAIResponse(text, aiResponse, isSentence);

      // 如果是单词或词组，尝试从数据库获取音标（不强制）
      if (!isSentence && result.meanings.length > 0) {
        try {
          // 尝试通过 getWordDetail 获取音标信息（如果数据库中存在）
          // 如果之前已经尝试过但失败了，这里可能会再次失败，但不影响主流程
          const wordDetail = await this.getWordDetail(text);
          if (wordDetail) {
            if (wordDetail.usPhonetic)
              result.usPhonetic = wordDetail.usPhonetic;
            if (wordDetail.ukPhonetic)
              result.ukPhonetic = wordDetail.ukPhonetic;
          }
        } catch {
          // 忽略错误，音标是可选的
        }
      }

      return result;
    } catch (error) {
      this.logger.error(
        `AI翻译失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
      throw new Error('翻译服务暂时不可用，请稍后重试');
    }
  }

  /**
   * 解析AI返回的翻译结果
   */
  private parseAIResponse(
    originalText: string,
    aiResponse: string,
    isSentence: boolean,
  ): WordDetailResDto {
    const result: WordDetailResDto = {
      id: '', // AI翻译没有ID
      headword: originalText,
      meanings: [],
      exampleSentences: [],
      examTags: [],
      phrases: [],
      synonyms: [],
      wordRelations: [],
    };

    if (isSentence) {
      // 句子直接返回翻译
      result.meanings = [
        {
          partOfSpeech: '',
          meaningCn: aiResponse,
        },
      ];
    } else {
      // 解析单词/词组的词性和含义
      // 尝试提取音标
      const phoneticMatch = aiResponse.match(
        /(?:美式[：:]?\s*)?\/?([^/]+)\/|(?:英式[：:]?\s*)?\/?([^/]+)\//g,
      );

      if (phoneticMatch) {
        // 简单提取音标（实际可能需要更复杂的解析）
        const phonetics = phoneticMatch.map((m) =>
          m.replace(/[/美式英式：:\s]/g, ''),
        );
        if (phonetics[0]) result.usPhonetic = phonetics[0];
        if (phonetics[1]) result.ukPhonetic = phonetics[1];
      }

      // 解析词性和含义
      // 匹配格式：词性. 含义 或 词性：含义
      const meaningPattern = /([a-zA-Z]+\.?)\s*[：:.]?\s*([^\n]+)/g;
      let match;
      const meaningsMap = new Map<string, string[]>();

      while ((match = meaningPattern.exec(aiResponse)) !== null) {
        const pos = match[1].replace('.', '').trim();
        const meaning = match[2].trim();

        // 过滤掉音标行
        if (!meaning.match(/^\/[^/]+\//)) {
          if (!meaningsMap.has(pos)) {
            meaningsMap.set(pos, []);
          }
          meaningsMap.get(pos)!.push(meaning);
        }
      }

      // 转换为数组格式
      if (meaningsMap.size > 0) {
        meaningsMap.forEach((meanings, pos) => {
          meanings.forEach((meaning) => {
            result.meanings.push({
              partOfSpeech: pos,
              meaningCn: meaning,
            });
          });
        });
      } else {
        // 如果没有解析到结构化格式，将整个回复作为翻译
        const cleanedResponse = aiResponse
          .replace(/美式[：:]?\s*\/[^/]+\//g, '')
          .replace(/英式[：:]?\s*\/[^/]+\//g, '')
          .trim();
        result.meanings = [
          {
            partOfSpeech: '',
            meaningCn: cleanedResponse,
          },
        ];
      }
    }

    return result;
  }
}
