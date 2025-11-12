import type { ITToken, ITWord } from '../types';

/**
 * 将文本按句子切分
 * 支持英文句子的常见结束符：. ! ? ;
 * @param text 输入文本
 * @returns 句子数组
 */
export const splitIntoSentences = (text: string): string[] => {
  // 更智能的句子切分，考虑缩写词等特殊情况
  // 匹配句子结束符，但排除常见的缩写词
  const abbreviationPattern = /\b(Mr|Mrs|Ms|Dr|Prof|Rev|St|Ave|Rd|Blvd|Inc|Ltd|Corp|Co|etc|vs|e\.g|i\.e|U\.S|U\.K|A\.D|B\.C)\s*\./gi;

  // 先标记缩写词，避免被误认为句子结束
  const processedText = text.replace(abbreviationPattern, (match) =>
    match.replace('.', '{{ABBREV_DOT}}')
  );

  // 匹配句子结束符
  const sentenceRegex = /([.!?;]+)\s*/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentenceRegex.exec(processedText)) !== null) {
    const sentence = processedText.slice(lastIndex, match.index + match[1].length).trim();
    if (sentence) {
      // 恢复缩写词中的点号
      const restoredSentence = sentence.replace(/{{ABBREV_DOT}}/g, '.');
      sentences.push(restoredSentence);
    }
    lastIndex = match.index + match[0].length;
  }

  // 处理最后一个句子（如果没有结束符）
  const lastSentence = processedText.slice(lastIndex).trim();
  if (lastSentence) {
    const restoredSentence = lastSentence.replace(/{{ABBREV_DOT}}/g, '.');
    sentences.push(restoredSentence);
  }

  return sentences;
};

/**
 * 将文本按英文单词拆分为tokens
 * 支持以下格式：
 * - 缩写词: he's, don't, can't, I'm, you're, won't
 * - 连字符单词: mother-in-law, well-being, twenty-one
 * - 所有格: children's, dog's, James's
 * - 数字: 123, 3.14, 1,000
 * @param text 输入文本
 * @param wordsConfig 单词配置映射表（word -> ITWord）
 * @returns Token数组
 */
export const tokenizeText = (
  text: string,
  wordsConfig: Map<string, ITWord> = new Map()
): ITToken[] => {
  const tokens: ITToken[] = [];

  // 更完整的正则表达式
  // 支持多种撇号字符：' (U+0027), ' (U+2019), ʼ (U+02BC), ‛ (U+201B), ʻ (U+02BB)
  const apostrophes = "'’ʼ‛ʻ";
  const regexPattern = `([A-Za-z]+(?:[${apostrophes}][A-Za-z]+)*(?:-[A-Za-z]+)*|\\d+(?:[.,]\\d+)*|[^\\w\\s]|\\s+)`;
  const regex = new RegExp(regexPattern, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    const content = match[1];

    if (/[A-Za-z]/.test(content)) {
      // 英文单词（包括缩写词、连字符单词、所有格）
      const lowerContent = content.toLowerCase();
      const wordConfig = wordsConfig.get(lowerContent);

      tokens.push({
        type: 'word',
        content: lowerContent,
        original: content,
        highlighted: wordConfig?.highlight ?? false,
        hidden: wordConfig?.hidden ?? false,
        wordConfig: wordConfig,
      });
    } else if (/\d/.test(content)) {
      // 数字（包括小数、千分位）
      tokens.push({
        type: 'word',
        content: content,
        original: content,
        highlighted: false,
        hidden: false,
      });
    } else if (/\s+/.test(content)) {
      // 空格
      tokens.push({
        type: 'space',
        content,
        original: content,
      });
    } else {
      // 标点符号
      tokens.push({
        type: 'punctuation',
        content,
        original: content,
      });
    }
  }
  return tokens;
};

/**
 * 将单词配置数组转换为映射表
 */
export const buildWordsConfigMap = (words: ITWord[] = []): Map<string, ITWord> => {
  const configMap = new Map<string, ITWord>();
  words.forEach((word) => {
    const key = word.word.toLowerCase();
    configMap.set(key, word);
  });
  return configMap;
};

