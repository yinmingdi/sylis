// Auto-generated type definitions

export enum GrammarTag {
  // 名词性成分
  NOUN = 'NOUN', // 名词
  PRONOUN = 'PRONOUN', // 代词
  NOUN_PHRASE = 'NOUN_PHRASE', // 名词短语

  // 动词性成分
  VERB = 'VERB', // 动词
  AUXILIARY_VERB = 'AUXILIARY_VERB', // 助动词
  MODAL_VERB = 'MODAL_VERB', // 情态动词
  VERB_PHRASE = 'VERB_PHRASE', // 动词短语

  // 形容词性成分
  ADJECTIVE = 'ADJECTIVE', // 形容词
  ADJECTIVE_PHRASE = 'ADJECTIVE_PHRASE', // 形容词短语

  // 副词性成分
  ADVERB = 'ADVERB', // 副词
  ADVERB_PHRASE = 'ADVERB_PHRASE', // 副词短语

  // 介词性成分
  PREPOSITION = 'PREPOSITION', // 介词
  PREPOSITIONAL_PHRASE = 'PREPOSITIONAL_PHRASE', // 介词短语

  // 连词
  CONJUNCTION = 'CONJUNCTION', // 连词
  COORDINATING_CONJUNCTION = 'COORDINATING_CONJUNCTION', // 并列连词
  SUBORDINATING_CONJUNCTION = 'SUBORDINATING_CONJUNCTION', // 从属连词

  // 冠词
  ARTICLE = 'ARTICLE', // 冠词
  DEFINITE_ARTICLE = 'DEFINITE_ARTICLE', // 定冠词
  INDEFINITE_ARTICLE = 'INDEFINITE_ARTICLE', // 不定冠词

  // 句子成分
  SUBJECT = 'SUBJECT', // 主语
  PREDICATE = 'PREDICATE', // 谓语
  OBJECT = 'OBJECT', // 宾语
  DIRECT_OBJECT = 'DIRECT_OBJECT', // 直接宾语
  INDIRECT_OBJECT = 'INDIRECT_OBJECT', // 间接宾语
  COMPLEMENT = 'COMPLEMENT', // 补语
  ATTRIBUTE = 'ATTRIBUTE', // 定语
  ADVERBIAL = 'ADVERBIAL', // 状语

  // 从句
  SUBORDINATE_CLAUSE = 'SUBORDINATE_CLAUSE', // 从句
  RELATIVE_CLAUSE = 'RELATIVE_CLAUSE', // 定语从句
  NOUN_CLAUSE = 'NOUN_CLAUSE', // 名词性从句
  ADVERBIAL_CLAUSE = 'ADVERBIAL_CLAUSE', // 状语从句

  // 其他
  INTERJECTION = 'INTERJECTION', // 感叹词
  DETERMINER = 'DETERMINER', // 限定词
  NUMERAL = 'NUMERAL', // 数词
  PUNCTUATION = 'PUNCTUATION', // 标点符号
  UNKNOWN = 'UNKNOWN', // 未知
}

export interface WordGrammarAnalysis {
  /** 原始词语 */
  word: string;
  /** 词语在句子中的位置（从0开始） */
  position: number;
  /** 词语在句子中的起始字符位置 */
  startIndex: number;
  /** 词语在句子中的结束字符位置 */
  endIndex: number;
  /** 词性标签 */
  partOfSpeech: GrammarTag;
  /** 句法成分标签 */
  syntacticRole: GrammarTag;
  /** 语法标签的置信度 (0-1) */
  confidence: number;
  /** 语法解释 */
  explanation: string;
  /** 所属的短语或从句（如果有） */
  phraseGroup?: {
    /** 短语类型 */
    type: GrammarTag;
    /** 短语在句子中的起始位置 */
    startPosition: number;
    /** 短语在句子中的结束位置 */
    endPosition: number;
    /** 短语的核心词位置 */
    headPosition: number;
  };
}

export interface SentenceGrammarAnalysis {
  /** 原始句子 */
  sentence: string;
  /** 句子类型 */
  sentenceType: 'declarative' | 'interrogative' | 'imperative' | 'exclamatory';
  /** 句子结构 */
  sentenceStructure: 'simple' | 'compound' | 'complex' | 'compound-complex';
  /** 每个词语的语法分析 */
  words: WordGrammarAnalysis[];
  /** 短语分析 */
  phrases: Array<{
    /** 短语类型 */
    type: GrammarTag;
    /** 短语文本 */
    text: string;
    /** 短语起始位置 */
    startPosition: number;
    /** 短语结束位置 */
    endPosition: number;
    /** 短语的核心词 */
    head: string;
    /** 短语的修饰词 */
    modifiers: string[];
  }>;
  /** 从句分析 */
  clauses: Array<{
    /** 从句类型 */
    type: GrammarTag;
    /** 从句文本 */
    text: string;
    /** 从句起始位置 */
    startPosition: number;
    /** 从句结束位置 */
    endPosition: number;
    /** 从句的主语 */
    subject?: string;
    /** 从句的谓语 */
    predicate?: string;
  }>;
  /** 语法解析的总体置信度 */
  overallConfidence: number;
  /** 语法分析总结 */
  summary: string;
}

export const GrammarTagDescriptions: Record<GrammarTag, string> = {
  [GrammarTag.NOUN]: '名词',
  [GrammarTag.PRONOUN]: '代词',
  [GrammarTag.NOUN_PHRASE]: '名词短语',
  [GrammarTag.VERB]: '动词',
  [GrammarTag.AUXILIARY_VERB]: '助动词',
  [GrammarTag.MODAL_VERB]: '情态动词',
  [GrammarTag.VERB_PHRASE]: '动词短语',
  [GrammarTag.ADJECTIVE]: '形容词',
  [GrammarTag.ADJECTIVE_PHRASE]: '形容词短语',
  [GrammarTag.ADVERB]: '副词',
  [GrammarTag.ADVERB_PHRASE]: '副词短语',
  [GrammarTag.PREPOSITION]: '介词',
  [GrammarTag.PREPOSITIONAL_PHRASE]: '介词短语',
  [GrammarTag.CONJUNCTION]: '连词',
  [GrammarTag.COORDINATING_CONJUNCTION]: '并列连词',
  [GrammarTag.SUBORDINATING_CONJUNCTION]: '从属连词',
  [GrammarTag.ARTICLE]: '冠词',
  [GrammarTag.DEFINITE_ARTICLE]: '定冠词',
  [GrammarTag.INDEFINITE_ARTICLE]: '不定冠词',
  [GrammarTag.SUBJECT]: '主语',
  [GrammarTag.PREDICATE]: '谓语',
  [GrammarTag.OBJECT]: '宾语',
  [GrammarTag.DIRECT_OBJECT]: '直接宾语',
  [GrammarTag.INDIRECT_OBJECT]: '间接宾语',
  [GrammarTag.COMPLEMENT]: '补语',
  [GrammarTag.ATTRIBUTE]: '定语',
  [GrammarTag.ADVERBIAL]: '状语',
  [GrammarTag.SUBORDINATE_CLAUSE]: '从句',
  [GrammarTag.RELATIVE_CLAUSE]: '定语从句',
  [GrammarTag.NOUN_CLAUSE]: '名词性从句',
  [GrammarTag.ADVERBIAL_CLAUSE]: '状语从句',
  [GrammarTag.INTERJECTION]: '感叹词',
  [GrammarTag.DETERMINER]: '限定词',
  [GrammarTag.NUMERAL]: '数词',
  [GrammarTag.PUNCTUATION]: '标点符号',
  [GrammarTag.UNKNOWN]: '未知',
};

