import { AgentArtifactKind, CapabilityKey } from '@sylis/api-client/agent';

import type {
  SearchWordReqDto,
  SearchWordResDto,
  WordDetailResDto,
  TranslateTextReqDto,
} from '@/legacy-dto';

import {
  fetchLegacyWordDetail,
  searchLegacyWords,
} from './modern-word-adapter';
import { runLegacyArtifact } from '../../agent/api/legacy-artifact-adapter';

/**
 * 搜索单词
 */
export const searchWords = async (
  params: SearchWordReqDto,
): Promise<SearchWordResDto[]> => {
  return searchLegacyWords(params.keyword, params.limit) as Promise<
    SearchWordResDto[]
  >;
};

/**
 * 获取单词详情（支持单词文本或ID）
 * @param wordOrId - 单词文本或单词ID
 */
export const getWordDetail = async (
  wordOrId: string,
): Promise<WordDetailResDto> => {
  return fetchLegacyWordDetail(wordOrId);
};

/**
 * 翻译文字（单词或句子），如果数据库没有则使用AI翻译
 * @param text - 要翻译的文字
 */
export const translateText = async (
  text: string,
): Promise<WordDetailResDto> => {
  void ({} as TranslateTextReqDto);
  const normalized = text.trim();
  const isSentence = /\s/.test(normalized) || /[.!?]$/.test(normalized);
  if (isSentence) {
    const result = await runLegacyArtifact({
      capability: CapabilityKey.TRANSLATION_ANALYZE,
      artifactKind: AgentArtifactKind.TRANSLATION_ANALYSIS,
      sessionTitle: `句子翻译：${normalized.slice(0, 36)}`,
      instruction: `请将下面的英语文本翻译成简体中文，并解释关键表达：\n\n${normalized}`,
    });
    if (
      result.document.artifactKind !== AgentArtifactKind.TRANSLATION_ANALYSIS
    ) {
      throw new Error('Agent 未返回翻译产物');
    }
    return {
      id: result.artifact.id,
      headword: normalized,
      meanings: [
        {
          partOfSpeech: '',
          meaningCn: result.document.recommended.text,
        },
      ],
      exampleSentences: [],
      examTags: [],
      phrases: [],
      synonyms: [],
      wordRelations: [],
    };
  }
  try {
    return await fetchLegacyWordDetail(normalized);
  } catch {
    return {
      id: '',
      headword: normalized,
      meanings: [],
      exampleSentences: [],
      examTags: [],
      phrases: [],
      synonyms: [],
      wordRelations: [],
    };
  }
};
