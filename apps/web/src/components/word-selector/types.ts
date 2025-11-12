import type { BaseEditor, BaseElement, BaseText } from 'slate';
import type { ReactEditor } from 'slate-react';

// 单词建议项
export interface WordSuggestion {
  id: string;
  word: string;
  description?: string;
  tranCn?: string;
  phonetic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

// 位置信息
export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

// WordSuggestions 组件属性
export interface WordSuggestionsProps {
  suggestions: WordSuggestion[];
  position: Position | null;
  visible: boolean;
  selectedIndex: number;
  onSelect: (suggestion: WordSuggestion) => void;
  onClose: () => void;
  loading?: boolean;
}

// WordSelector 组件属性
export interface WordSelectorProps {
  placeholder?: string;
  initialValue?: string;
  onWordSelect?: (word: WordSuggestion) => void;
  onChange?: (value: string) => void;
  triggerChar?: string;
  maxSuggestions?: number;
  className?: string;
  disabled?: boolean;
  presetWords?: WordSuggestion[]; // 预设的单词列表
}

// 扩展的文本节点类型
export interface CustomText extends BaseText {
  bold?: boolean;
  code?: boolean;
  italic?: boolean;
  underline?: boolean;
}

// 单词元素类型
export interface WordElement extends BaseElement {
  type: 'word';
  word: string;
}

// 段落元素类型
export interface ParagraphElement extends BaseElement {
  type: 'paragraph';
}

// 自定义元素联合类型
export type CustomElement = WordElement | ParagraphElement;

// 自定义编辑器类型
export type CustomEditor = BaseEditor &
  ReactEditor & {
    isInline: (element: CustomElement) => boolean;
    isVoid: (element: CustomElement) => boolean;
    markableVoid: (element: CustomElement) => boolean;
  };

// 渲染元素属性
export interface RenderElementPropsFor<T extends CustomElement> {
  attributes: any;
  children: React.ReactNode;
  element: T;
}
