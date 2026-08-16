import { useEffect, useState, useMemo, useRef } from 'react';

import type {
  ITParagraph,
  ITParsedParagraph,
  ITSentence,
  ITWord,
} from '../types';
import {
  buildWordsConfigMap,
  splitIntoSentences,
  tokenizeText,
} from '../utils/textParser';

/**
 * 解析内容为段落数组
 */
export const useParseContent = (
  content: string | ITParagraph[],
  words: ITWord[] = [],
): ITParsedParagraph[] => {
  const [paragraphs, setParagraphs] = useState<ITParsedParagraph[]>([]);

  // Use ref to store the latest words to avoid dependency issues
  const wordsRef = useRef(words);

  // Update ref when words changes
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  // Memoize words key to prevent infinite loop when array reference changes
  const wordsKey = useMemo(() => {
    return JSON.stringify([...words].map((w) => w.word).sort());
  }, [words]);

  useEffect(() => {
    // 构建单词配置映射表
    const wordsConfigMap = buildWordsConfigMap(wordsRef.current);

    if (typeof content === 'string') {
      const lines = content.split('\n').filter((line) => line.trim() !== '');
      const parsedParagraphs = lines.map((line) => {
        const sentences = splitIntoSentences(line);
        const parsedSentences: ITSentence[] = sentences.map((sentence) => ({
          text: sentence,
          tokens: tokenizeText(sentence, wordsConfigMap),
        }));
        return {
          text: line,
          translation: '',
          sentences: parsedSentences,
        };
      });
      setParagraphs(parsedParagraphs);
    } else if (Array.isArray(content)) {
      const parsedParagraphs = content.map((paragraph) => {
        const sentences = splitIntoSentences(paragraph.text);
        const parsedSentences: ITSentence[] = sentences.map((sentence) => ({
          text: sentence,
          tokens: tokenizeText(sentence, wordsConfigMap),
        }));
        return {
          ...paragraph,
          sentences: parsedSentences,
        };
      });
      setParagraphs(parsedParagraphs);
    }
  }, [content, wordsKey]);

  return paragraphs;
};
