import { useState, useCallback } from 'react';

export interface UseSentenceTranslationReturn {
  translations: Record<string, string>; // {paragraphIndex-sentenceIndex: translation}
  loading: Record<string, boolean>; // {paragraphIndex-sentenceIndex: isLoading}
  translateSentence: (
    paragraphIndex: number,
    sentenceIndex: number,
    text: string,
    api?: (text: string) => Promise<string>,
  ) => Promise<void>;
  setTranslation: (
    paragraphIndex: number,
    sentenceIndex: number,
    translation: string,
  ) => void;
  clearTranslation: (paragraphIndex: number, sentenceIndex: number) => void;
  toggleTranslation: (paragraphIndex: number, sentenceIndex: number) => void;
  getShowTranslation: (
    paragraphIndex: number,
    sentenceIndex: number,
  ) => boolean;
}

// 生成句子状态的 key
const getSentenceKey = (
  paragraphIndex: number,
  sentenceIndex: number,
): string => {
  return `${paragraphIndex}-${sentenceIndex}`;
};

export const useSentenceTranslation = (
  onTranslate?:
    | ((
        text: string,
        paragraphIndex: number,
        sentenceIndex: number,
      ) => Promise<string>)
    | ((text: string) => Promise<string>),
): UseSentenceTranslationReturn => {
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [showTranslation, setShowTranslation] = useState<
    Record<string, boolean>
  >({});

  const translateSentence = useCallback(
    async (
      paragraphIndex: number,
      sentenceIndex: number,
      text: string,
      api?: (text: string) => Promise<string>,
    ) => {
      const key = getSentenceKey(paragraphIndex, sentenceIndex);

      // 如果已有翻译，直接显示
      if (translations[key]) {
        setShowTranslation((prev) => ({ ...prev, [key]: true }));
        return;
      }

      // 如果正在加载，不重复请求
      if (loading[key]) {
        return;
      }

      // 立即显示翻译容器（用于显示加载动画）
      setShowTranslation((prev) => ({ ...prev, [key]: true }));
      setLoading((prev) => ({ ...prev, [key]: true }));

      try {
        const translateApi = api || onTranslate;
        if (!translateApi) {
          throw new Error('No translation API provided');
        }

        // 处理两种签名：onTranslate(text, paragraphIndex, sentenceIndex) 或 onTranslate(text)
        const translation =
          translateApi.length === 3
            ? await (
                translateApi as (
                  text: string,
                  paragraphIndex: number,
                  sentenceIndex: number,
                ) => Promise<string>
              )(text, paragraphIndex, sentenceIndex)
            : await (translateApi as (text: string) => Promise<string>)(text);
        setTranslations((prev) => ({ ...prev, [key]: translation }));
        setShowTranslation((prev) => ({ ...prev, [key]: true }));
      } catch (error) {
        console.error('Translation failed:', error);
        throw error;
      } finally {
        setLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [onTranslate, translations, loading],
  );

  const setTranslation = useCallback(
    (paragraphIndex: number, sentenceIndex: number, translation: string) => {
      const key = getSentenceKey(paragraphIndex, sentenceIndex);
      setTranslations((prev) => ({ ...prev, [key]: translation }));
    },
    [],
  );

  const clearTranslation = useCallback(
    (paragraphIndex: number, sentenceIndex: number) => {
      const key = getSentenceKey(paragraphIndex, sentenceIndex);
      setTranslations((prev) => {
        const newTranslations = { ...prev };
        delete newTranslations[key];
        return newTranslations;
      });
      setShowTranslation((prev) => {
        const newShow = { ...prev };
        delete newShow[key];
        return newShow;
      });
    },
    [],
  );

  const toggleTranslation = useCallback(
    (paragraphIndex: number, sentenceIndex: number) => {
      const key = getSentenceKey(paragraphIndex, sentenceIndex);
      setShowTranslation((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    [],
  );

  const getShowTranslation = useCallback(
    (paragraphIndex: number, sentenceIndex: number) => {
      const key = getSentenceKey(paragraphIndex, sentenceIndex);
      return showTranslation[key] ?? false;
    },
    [showTranslation],
  );

  return {
    translations,
    loading,
    translateSentence,
    setTranslation,
    clearTranslation,
    toggleTranslation,
    getShowTranslation,
  };
};
