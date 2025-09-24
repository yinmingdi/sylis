import { useEffect, useState } from "react";

import { useWordHelper } from "./hooks/word-helper";
import styles from './index.module.less';

export interface ReaderParagraph {
  text: string;
  translation: string;
}

export interface ReaderProps {
  content: string | ReaderParagraph[];
  onWordClick?: (word: string) => void;
}

interface Token {
  type: 'word' | 'punctuation' | 'space';
  content: string;
  original: string; // 原始文本，包含大小写
}

interface ReaderInnerParagraph extends ReaderParagraph {
  tokens: Token[];
}

/**
 * 将文本按英文单词拆分为tokens
 * @param text 输入文本
 * @returns Token数组
 */
const tokenizeText = (text: string): Token[] => {
  const tokens: Token[] = [];
  const regex = /(\w+|[^\w\s]|\s+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const content = match[1];

    if (/\w+/.test(content)) {
      // 英文单词
      tokens.push({
        type: 'word',
        content: content.toLowerCase(),
        original: content
      });
    } else if (/\s+/.test(content)) {
      // 空格
      tokens.push({
        type: 'space',
        content,
        original: content
      });
    } else {
      // 标点符号
      tokens.push({
        type: 'punctuation',
        content,
        original: content
      });
    }
  }

  return tokens;
};

const useParseContent = (content: string | ReaderParagraph[]) => {
  const [paragraphs, setParagraphs] = useState<ReaderInnerParagraph[]>([]);
  useEffect(() => {
    if (typeof content === 'string') {
      const lines = content.split('\n').filter(line => line.trim() !== '');
      const parsedParagraphs = lines.map(line => ({
        text: line,
        translation: '',
        tokens: tokenizeText(line)
      }));
      setParagraphs(parsedParagraphs);
    } else if (Array.isArray(content)) {
      const parsedParagraphs = content.map(paragraph => ({
        ...paragraph,
        tokens: tokenizeText(paragraph.text)
      }));
      setParagraphs(parsedParagraphs);
    }
  }, [content]);

  return paragraphs;
};


export const Reader: React.FC<ReaderProps> = ({ content }) => {
  const paragraphs = useParseContent(content);
  const { showWordHelper } = useWordHelper();


  const renderToken = (token: Token, index: number) => {
    switch (token.type) {
      case 'word':
        return (
          <span
            key={index}
            className={styles.word}
            data-word={token.content}
          >
            {token.original}
          </span>
        );
      case 'punctuation':
        return (
          <span key={index} className={styles.punctuation}>
            {token.content}
          </span>
        );
      case 'space':
        return (
          <span key={index} className={styles.space}>
            {token.content}
          </span>
        );
      default:
        return null;
    }
  };



  const renderParagraph = (paragraph: ReaderInnerParagraph, paragraphIndex: number) => {
    return (
      <div key={paragraphIndex} className={styles.paragraph}>
        <div className={styles.text}>
          {paragraph.tokens.map((token, tokenIndex) =>
            renderToken(token, tokenIndex)
          )}
        </div>
        {paragraph.translation && (
          <div className={styles.translation}>
            {paragraph.translation}
          </div>
        )}
      </div>
    );
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const word = target.dataset.word
    if (word) {
      showWordHelper(word, target);
    }
  };

  return (
    <div className={styles.reader} onClick={handleClick}>
      {paragraphs.map((paragraph, index) =>
        renderParagraph(paragraph, index)
      )}
    </div>
  );
};
