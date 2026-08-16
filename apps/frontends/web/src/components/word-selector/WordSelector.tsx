import React, {
  Fragment,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Editor,
  Transforms,
  Range,
  createEditor,
  type Descendant,
} from 'slate';
import { withHistory } from 'slate-history';
import {
  Editable,
  ReactEditor,
  type RenderElementProps,
  type RenderLeafProps,
  Slate,
  useFocused,
  useSelected,
  withReact,
} from 'slate-react';

import type { SearchWordResDto } from '@/legacy-dto';

import styles from './index.module.less';
import type {
  WordElement,
  WordSelectorProps,
  WordSuggestion,
  RenderElementPropsFor,
  Position,
  CustomText,
  CustomElement,
} from './types';
import { WordSuggestions } from './WordSuggestions';
import { searchWords } from '../../modules/vocabulary/api/words';

const IS_MAC =
  typeof window !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const WordSelector: React.FC<WordSelectorProps> = ({
  placeholder = '使用 @ 选择单词...',
  initialValue = '',
  onWordSelect,
  onChange,
  triggerChar = '@',
  maxSuggestions = 10,
  className,
  disabled = false,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [target, setTarget] = useState<Range | null>(null);
  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [suggestions, setSuggestions] = useState<WordSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const renderElement = useCallback(
    (props: RenderElementProps) => <Element {...props} />,
    [],
  );

  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    [],
  );

  const editor = useMemo(
    () => withWords(withReact(withHistory(createEditor()))),
    [],
  );

  // API 调用获取建议
  const fetchSuggestions = useCallback(
    async (keyword: string) => {
      if (!keyword.trim()) {
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const results = await searchWords({
          keyword: keyword.trim(),
          limit: maxSuggestions,
        });

        // 转换 API 响应格式为组件需要的格式
        const convertedSuggestions: WordSuggestion[] = results.map(
          (word: SearchWordResDto) => ({
            id: word.id,
            word: word.headword,
            description: word.translation,
            meaning: word.translation,
            phonetic: undefined, // API 暂未提供音标
            difficulty: undefined, // API 暂未提供难度
          }),
        );

        setSuggestions(convertedSuggestions);
      } catch (error) {
        console.error('Failed to fetch word suggestions:', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [maxSuggestions],
  );

  // 当搜索词变化时调用 API
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (search) {
        fetchSuggestions(search);
      } else {
        setSuggestions([]);
      }
    }, 100); // 防抖，300ms 延迟

    return () => clearTimeout(timeoutId);
  }, [search, fetchSuggestions]);

  // 处理composition事件（IME输入法）
  const onCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const onCompositionEnd = useCallback(
    (event: any) => {
      setIsComposing(false);
      // 手动插入composition结束时的文本
      if (event.data) {
        Transforms.insertText(editor, event.data);
      }
    },
    [editor],
  );

  // 键盘事件处理
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // 在composition期间不处理某些键盘事件
      if (isComposing) {
        return;
      }

      if (target && suggestions.length > 0) {
        switch (event.key) {
          case 'ArrowDown': {
            event.preventDefault();
            const nextIndex = index >= suggestions.length - 1 ? 0 : index + 1;
            setIndex(nextIndex);
            break;
          }
          case 'ArrowUp': {
            event.preventDefault();
            const prevIndex = index <= 0 ? suggestions.length - 1 : index - 1;
            setIndex(prevIndex);
            break;
          }
          case 'Tab':
          case 'Enter':
            event.preventDefault();
            if (suggestions[index]) {
              Transforms.select(editor, target);
              insertWord(editor, suggestions[index]);
              onWordSelect?.(suggestions[index]);
              setTarget(null);
            }
            break;
          case 'Escape':
            event.preventDefault();
            setTarget(null);
            break;
        }
      }
    },
    [suggestions, editor, index, target, onWordSelect, isComposing],
  );

  // 更新弹出框位置
  useEffect(() => {
    if (target && suggestions.length > 0 && ref.current) {
      const domRange = ReactEditor.toDOMRange(editor, target);
      const rect = domRange.getBoundingClientRect();

      setPosition({
        x: rect.left + window.pageXOffset,
        y: rect.top + window.pageYOffset + 24,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setPosition(null);
    }
  }, [suggestions.length, editor, target]);

  // 处理建议选择
  const handleSelect = useCallback(
    (suggestion: WordSuggestion) => {
      if (target) {
        Transforms.select(editor, target);
        insertWord(editor, suggestion);
        onWordSelect?.(suggestion);
        setTarget(null);
      }
    },
    [editor, target, onWordSelect],
  );

  // 处理关闭
  const handleClose = useCallback(() => {
    setTarget(null);
  }, []);

  // 解析初始值中的@word格式
  const parseInitialValue = useCallback((value: string) => {
    if (!value) return [{ text: '' }];

    const children: any[] = [];
    const parts = value.split(/(@[\w\u4e00-\u9fff]+)/g);

    parts.forEach((part) => {
      if (part.startsWith('@')) {
        // 这是一个@word格式，转换为word元素
        const word = part.substring(1); // 移除@符号
        children.push({
          type: 'word',
          word: word,
          children: [{ text: '' }],
        });
      } else if (part.length > 0) {
        // 这是普通文本（包括空格），但确保不为空
        children.push({ text: part });
      }
    });

    // 确保至少有一个文本节点
    if (children.length === 0) {
      children.push({ text: '' });
    }

    // 如果最后一个元素是word，在它后面添加一个空格，确保用户可以继续输入
    const lastChild = children[children.length - 1];
    if (lastChild && lastChild.type === 'word') {
      children.push({ text: ' ' });
    }

    return children;
  }, []);

  // 初始值
  const initialEditorValue: Descendant[] = useMemo(
    () => [
      {
        type: 'paragraph',
        children: parseInitialValue(initialValue),
      },
    ],
    [initialValue, parseInitialValue],
  );

  return (
    <div className={`${styles.wordSelector} ${className}`} ref={ref}>
      <Slate
        key={initialValue || 'empty'} // 当初始值变化时重新渲染，空值时使用'empty'作为key
        editor={editor}
        initialValue={initialEditorValue}
        onChange={() => {
          const { selection } = editor;

          if (selection && Range.isCollapsed(selection)) {
            const [start] = Range.edges(selection);

            // 从光标位置向前查找 @ 符号
            let before = start;
            let foundTrigger = false;
            let triggerOffset: any = null;

            // 向前查找 @ 符号，最多查找 100 个字符
            for (let i = 0; i < 100; i++) {
              const beforeChar = Editor.before(editor, before);
              if (!beforeChar) break;

              const charRange = Editor.range(editor, beforeChar, before);
              const charText = Editor.string(editor, charRange);

              if (charText === triggerChar) {
                foundTrigger = true;
                triggerOffset = beforeChar;
                break;
              }

              // 如果遇到已插入的 word 元素，停止查找
              const [nodeAtChar] = Editor.node(editor, beforeChar);
              const nodeElement = nodeAtChar as any;
              if (nodeElement.type === 'word') {
                break;
              }

              // 如果遇到段落边界，停止查找
              if (nodeElement.type === 'paragraph' && beforeChar.offset === 0) {
                break;
              }

              before = beforeChar;
            }

            if (foundTrigger && triggerOffset) {
              // 获取 @ 符号到光标位置之间的所有文本（包括空格）
              const searchRange = Editor.range(editor, triggerOffset, start);
              const searchText = Editor.string(editor, searchRange);

              // 匹配 @ 符号后跟任意字符（包括空格），但不包括换行符
              // 使用 [^\n\r]+ 匹配除了换行符外的所有字符，包括空格
              const match = searchText.match(
                new RegExp(`^${triggerChar}([^\\n\\r]*)$`),
              );

              if (match) {
                const searchKeyword = match[1].trim();

                // 如果搜索关键词不为空（去除空格后），显示建议列表
                // 允许在输入过程中包含空格，比如 "hello world"
                if (searchKeyword.length > 0) {
                  setTarget(searchRange);
                  setSearch(searchKeyword);
                  setIndex(0);

                  // 触发 onChange - 获取编辑器的纯文本内容
                  const text = Editor.string(editor, []);
                  onChange?.(text);
                  return;
                }
              }
            }
          }

          setTarget(null);

          // 触发 onChange - 获取编辑器的纯文本内容
          const text = Editor.string(editor, []);
          onChange?.(text);
        }}
      >
        <Editable
          className={styles.editor}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder={placeholder}
          readOnly={disabled}
        />
      </Slate>

      <WordSuggestions
        suggestions={suggestions}
        position={position}
        visible={!!target && (suggestions.length > 0 || loading)}
        selectedIndex={index}
        onSelect={handleSelect}
        onClose={handleClose}
      />
    </div>
  );
};

// 扩展编辑器以支持单词元素
const withWords = (editor: any) => {
  const { isInline, isVoid, markableVoid } = editor;

  editor.isInline = (element: any) => {
    return element.type === 'word' ? true : isInline(element);
  };

  editor.isVoid = (element: any) => {
    return element.type === 'word' ? true : isVoid(element);
  };

  editor.markableVoid = (element: any) => {
    return element.type === 'word' || markableVoid(element);
  };

  return editor;
};

// 插入单词
const insertWord = (editor: any, suggestion: WordSuggestion) => {
  const word: WordElement = {
    type: 'word',
    word: suggestion.word,
    children: [{ text: '' }],
  };
  Transforms.insertNodes(editor, word);
  Transforms.move(editor);
};

// 叶子节点渲染器
const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  const customLeaf = leaf as CustomText;

  if (customLeaf.bold) {
    children = <strong>{children}</strong>;
  }

  if (customLeaf.code) {
    children = <code>{children}</code>;
  }

  if (customLeaf.italic) {
    children = <em>{children}</em>;
  }

  if (customLeaf.underline) {
    children = <u>{children}</u>;
  }

  return <span {...attributes}>{children}</span>;
};

// 元素渲染器
const Element = (props: RenderElementProps) => {
  const { attributes, children, element } = props;
  const customElement = element as CustomElement;

  switch (customElement.type) {
    case 'word':
      return <Word {...(props as any)} />;
    default:
      return <p {...attributes}>{children}</p>;
  }
};

// 单词组件
const Word = ({
  attributes,
  children,
  element,
}: RenderElementPropsFor<WordElement>) => {
  const selected = useSelected();
  const focused = useFocused();
  const wordElement = element as WordElement;
  const style: React.CSSProperties = {
    padding: '2px 6px',
    margin: '0 2px',
    verticalAlign: 'baseline',
    display: 'inline-block',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-primary-100)',
    color: 'var(--color-primary-700)',
    fontSize: '0.9em',
    fontWeight: 'var(--font-weight-medium)',
    boxShadow:
      selected && focused ? '0 0 0 2px var(--color-primary-300)' : 'none',
    transition: 'all var(--duration-fast) var(--ease-out)',
  };

  return (
    <span {...attributes} contentEditable={false} style={style}>
      {IS_MAC ? (
        <Fragment>
          {children}@{wordElement.word}
        </Fragment>
      ) : (
        <Fragment>
          @{wordElement.word}
          {children}
        </Fragment>
      )}
    </span>
  );
};

export default WordSelector;
