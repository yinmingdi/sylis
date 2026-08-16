/**
 * 单词配置接口
 */
export interface ITWord {
  word: string; // 单词（小写，用于匹配）
  highlight?: boolean; // 是否高亮
  hidden?: boolean; // 是否隐藏（填空模式）
  cloze?: boolean; // 是否需要填空
  onClick?: (word: string, original: string) => void; // 单词级别的点击处理
}

/**
 * 段落接口（输入格式）
 */
export interface ITParagraph {
  text: string;
  translation?: string;
}

/**
 * 功能配置
 */
export interface ITFeatures {
  translation?: boolean; // 是否启用翻译功能
  grammarAnalysis?: boolean; // 是否启用语法解析功能
  clozeTest?: boolean; // 是否启用填空模式
  wordClick?: boolean; // 是否启用单词点击功能
}

/**
 * Token 类型
 */
export interface ITToken {
  type: 'word' | 'punctuation' | 'space';
  content: string; // 小写内容（用于匹配）
  original: string; // 原始文本（包含大小写）
  highlighted?: boolean; // 是否高亮
  hidden?: boolean; // 是否隐藏（填空模式）
  wordConfig?: ITWord; // 关联的单词配置
}

/**
 * 解析后的句子
 */
export interface ITSentence {
  text: string;
  tokens: ITToken[];
}

/**
 * 解析后的段落
 */
export interface ITParsedParagraph extends ITParagraph {
  sentences: ITSentence[];
}

/**
 * 句子状态
 */
export interface ITSentenceState {
  showTranslation: boolean; // 是否显示翻译
  translation: string | null; // 翻译内容
  translationLoading: boolean; // 翻译加载状态
}
