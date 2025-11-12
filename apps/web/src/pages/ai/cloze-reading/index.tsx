import {
  Button,
  Card,
  Toast,
  Divider,
} from 'antd-mobile';
import React, { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import {
  AiOutlineReload,
  AiOutlineBook,
} from 'react-icons/ai';
import { useNavigate, useParams } from 'react-router-dom';

import styles from './index.module.less';
import { AppBar } from '../../../components/app-bar';
import {
  InteractiveText,
  renderDefaultToken,
  type ITToken,
  type ITWord,
} from '../../../components/interactive-text';
import { splitIntoSentences, tokenizeText } from '../../../components/interactive-text/utils/textParser';
import { PageView } from '../../../components/view';
import { SpellingInput } from '../../../components/word-spelling';
import { getArticleById } from '../../../modules/articles/api';
import ArticleHeader from '../../common/articles/components/article-header';

type PageStatus = 'loading' | 'testing';

// 文章数据
interface Article {
  id: string;
  title: string;
  content: string;
  words: Word[];
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  articleType?: 'STORY' | 'NEWS' | 'ESSAY' | 'CONVERSATION';
  length?: 'SHORT' | 'MEDIUM' | 'LONG';
  createdAt?: string;
}

// 单词数据
interface Word {
  id: string;
  word: string;
  tranCn: string;
}

// 填空空白
interface ClozeBlank {
  id: string;
  word: string; // 单词（小写）
  correctAnswer: string;
  userAnswer: string;
  hint?: string;
  isCorrect?: boolean;
}


const ClozeReadingPage: React.FC = () => {
  const navigate = useNavigate();
  const { articleId } = useParams<{ articleId: string }>();
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [article, setArticle] = useState<Article | null>(null);
  const [clozeBlanks, setClozeBlanks] = useState<ClozeBlank[]>([]);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const measureRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const [answerWidths, setAnswerWidths] = useState<Map<string, number>>(new Map());
  // 存储每个单词应该隐藏的位置标识符 (word -> positionKey)
  const [hiddenPositions, setHiddenPositions] = useState<Map<string, string>>(new Map());

  // 解析文章并找出每个单词的所有出现位置，然后随机选择一个位置
  const findAndSelectRandomPositions = useCallback((content: string, wordsToTest: Word[]) => {
    // 解析文章内容
    const paragraphs = content.split('\n').filter((line) => line.trim() !== '');
    const wordPositions = new Map<string, Array<{
      paragraphIndex: number;
      sentenceIndex: number;
      tokenIndex: number;
    }>>();

    // 找出每个单词的所有出现位置
    paragraphs.forEach((paragraphText, paragraphIndex) => {
      const sentences = splitIntoSentences(paragraphText);
      sentences.forEach((sentenceText, sentenceIndex) => {
        const tokens = tokenizeText(sentenceText);
        tokens.forEach((token, tokenIndex) => {
          if (token.type === 'word') {
            const lowerWord = token.content.toLowerCase();
            if (!wordPositions.has(lowerWord)) {
              wordPositions.set(lowerWord, []);
            }
            wordPositions.get(lowerWord)!.push({
              paragraphIndex,
              sentenceIndex,
              tokenIndex,
            });
          }
        });
      });
    });

    // 为每个需要测试的单词随机选择一个位置
    const selectedPositions = new Map<string, string>();

    wordsToTest.forEach((word) => {
      const lowerWord = word.word.toLowerCase();
      const positions = wordPositions.get(lowerWord);

      if (positions && positions.length > 0) {
        // 随机选择一个位置
        const randomIndex = Math.floor(Math.random() * positions.length);
        const selectedPosition = positions[randomIndex];
        const positionKey = `${selectedPosition.paragraphIndex}-${selectedPosition.sentenceIndex}-${selectedPosition.tokenIndex}`;

        selectedPositions.set(lowerWord, positionKey);
      }
    });

    setHiddenPositions(selectedPositions);
  }, []);

  // 获取文章数据
  const fetchArticle = useCallback(async () => {
    if (!articleId) {
      Toast.show({
        content: '文章ID不存在',
        icon: 'fail',
      });
      navigate('/ai');
      return;
    }

    try {
      setLoading(true);
      const result = await getArticleById(articleId);

      if (result.data) {
        const articleData = result.data;
        const article: Article = {
          id: articleData.id,
          title: articleData.title,
          content: articleData.content,
          words: articleData.usedWords?.map((word: string, index: number) => ({
            id: `word_${index}`,
            word: word,
            tranCn: '', // 从API返回的数据中可能没有翻译，需要根据实际情况调整
          })) || [],
          difficulty: articleData.difficulty,
          articleType: articleData.articleType,
          length: articleData.length,
          createdAt: articleData.createdAt,
        };

        setArticle(article);

        // 生成填空空白
        const blanks: ClozeBlank[] = [];
        const wordsToTest = article.words.slice(0, Math.min(5, article.words.length)); // 最多5个单词

        wordsToTest.forEach((word, index) => {
          blanks.push({
            id: `blank_${index}`,
            word: word.word.toLowerCase(),
            correctAnswer: word.word,
            userAnswer: '',
            hint: word.tranCn,
          });
        });

        setClozeBlanks(blanks);

        // 找出每个单词的所有出现位置，并随机选择一个位置
        findAndSelectRandomPositions(article.content, wordsToTest);

        setPageStatus('testing');
      } else {
        throw new Error('获取文章失败');
      }
    } catch (error: any) {
      console.error('获取文章失败:', error);
      Toast.show({
        content: error.message || '获取文章失败',
        icon: 'fail',
      });
      navigate('/ai');
    } finally {
      setLoading(false);
    }
  }, [articleId, navigate, findAndSelectRandomPositions]);

  // 组件挂载时获取文章
  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  // 测量答案宽度
  useLayoutEffect(() => {
    const clozeTextElement = document.querySelector(`.${styles.clozeText}`);

    if (clozeTextElement && measureRefs.current.size > 0) {
      const computedStyle = window.getComputedStyle(clozeTextElement);

      // 先设置所有测量元素的样式
      measureRefs.current.forEach((measureElement) => {
        if (measureElement) {
          measureElement.style.fontSize = computedStyle.fontSize;
          measureElement.style.fontFamily = computedStyle.fontFamily;
          measureElement.style.fontWeight = computedStyle.fontWeight;
          measureElement.style.letterSpacing = computedStyle.letterSpacing;
        }
      });

      // 使用 requestAnimationFrame 确保样式已应用后再测量
      requestAnimationFrame(() => {
        const widths = new Map<string, number>();
        measureRefs.current.forEach((measureElement, answerKey) => {
          if (measureElement) {
            const width = measureElement.offsetWidth + 10;
            if (width > 0) {
              widths.set(answerKey, width);
            }
          }
        });

        if (widths.size > 0) {
          setAnswerWidths(new Map(widths));
        }
      });
    }
  }, [clozeBlanks, article?.content]);

  // 获取单词的填空状态
  const getBlankByWord = useCallback((word: string): ClozeBlank | undefined => {
    return clozeBlanks.find(blank => blank.word === word.toLowerCase());
  }, [clozeBlanks]);

  // 生成 InteractiveText 的 words 配置
  // 注意：这里不设置 hidden: true，而是在 renderClozeToken 中根据位置来决定是否隐藏
  const interactiveWords = useMemo<ITWord[]>(() => {
    return clozeBlanks.map((blank) => ({
      word: blank.word,
      hidden: false, // 不在 words 配置中设置 hidden，而是在 renderClozeToken 中根据位置判断
    }));
  }, [clozeBlanks]);

  // 提交填空测试
  const handleSubmitTest = useCallback(() => {
    const unansweredCount = clozeBlanks.filter((blank) => !blank.userAnswer).length;
    if (unansweredCount > 0) {
      Toast.show({
        content: `还有${unansweredCount}题未完成`,
        icon: 'fail',
      });
      return;
    }

    // 计算结果并更新填空状态
    let correctCount = 0;
    const updatedBlanks = clozeBlanks.map((blank) => {
      const isCorrect = blank.userAnswer.toLowerCase() === blank.correctAnswer.toLowerCase();
      if (isCorrect) correctCount++;
      return { ...blank, isCorrect };
    });

    setClozeBlanks(updatedBlanks);
    setIsSubmitted(true);

    // 显示结果提示
    const accuracy = Math.round((correctCount / clozeBlanks.length) * 100);
    Toast.show({
      content: `测试完成！正确率：${accuracy}% (${correctCount}/${clozeBlanks.length})`,
      icon: correctCount === clozeBlanks.length ? 'success' : 'fail',
      duration: 3000,
    });
  }, [clozeBlanks]);

  // 重新开始
  const handleRestart = useCallback(() => {
    setClozeBlanks([]);
    setIsSubmitted(false);

    if (article) {
      const blanks: ClozeBlank[] = [];
      const wordsToTest = article.words.slice(0, Math.min(5, article.words.length));

      wordsToTest.forEach((word, index) => {
        blanks.push({
          id: `blank_${index}`,
          word: word.word.toLowerCase(),
          correctAnswer: word.word,
          userAnswer: '',
          hint: word.tranCn,
        });
      });

      setClozeBlanks(blanks);

      // 重新随机选择位置
      findAndSelectRandomPositions(article.content, wordsToTest);
    }
  }, [article, findAndSelectRandomPositions]);

  const renderClozeToken = useCallback(
    (token: ITToken, index: number, paragraphIndex?: number, sentenceIndex?: number) => {
      // 只有当 token 是单词类型时才处理
      if (token.type === 'word') {
        const lowerWord = token.content.toLowerCase();
        const positionKey = paragraphIndex !== undefined && sentenceIndex !== undefined
          ? `${paragraphIndex}-${sentenceIndex}-${index}`
          : null;

        // 检查当前位置是否应该被隐藏
        const shouldHide = positionKey && hiddenPositions.has(lowerWord) && hiddenPositions.get(lowerWord) === positionKey;

        if (shouldHide) {
          const blank = getBlankByWord(lowerWord);
          if (!blank) {
            return renderDefaultToken(token, index);
          }

          const isCorrect =
            !!blank.userAnswer &&
            blank.userAnswer.toLowerCase() === blank.correctAnswer.toLowerCase();
          const showResult = isSubmitted && blank.userAnswer;
          const answerWidth = answerWidths.get(blank.id);

          return (
            <span key={index} className={styles.spellingBlank}>
              {/* 隐藏的测量元素，用于获取答案的实际宽度 */}
              <span
                ref={(el) => {
                  if (el) {
                    measureRefs.current.set(blank.id, el);
                  } else {
                    measureRefs.current.delete(blank.id);
                  }
                }}
                style={{
                  position: 'absolute',
                  visibility: 'hidden',
                  whiteSpace: 'nowrap',
                  top: '-9999px',
                  left: '-9999px',
                }}
              >
                {blank.correctAnswer}
              </span>
              <SpellingInput
                value={blank.userAnswer}
                answer={blank.correctAnswer}
                isSubmitted={isSubmitted}
                autoFocus={false}
                className={styles.clozeSpellingInput}
                width={answerWidth}
                onChange={(value) => {
                  setClozeBlanks((prev) =>
                    prev.map((b) =>
                      b.id === blank.id
                        ? { ...b, userAnswer: value, isCorrect: undefined }
                        : b,
                    ),
                  );
                }}
                onSubmit={handleSubmitTest}
                onEditAfterSubmit={() => {
                  setIsSubmitted(false);
                  setClozeBlanks((prev) => prev.map((b) => ({ ...b, isCorrect: undefined })));
                }}
              />
              {showResult && !isCorrect && (
                <span className={styles.correctAnswer}>{blank.correctAnswer}</span>
              )}
            </span>
          );
        }
      }

      return renderDefaultToken(token, index);
    },
    [getBlankByWord, handleSubmitTest, isSubmitted, answerWidths, hiddenPositions],
  );

  // 渲染加载页面
  const renderLoadingPage = () => (
    <div className={styles.loadingPage}>
      <div className={styles.loadingContent}>
        <div className={styles.loadingIcon}>
          <AiOutlineBook className={styles.bookIcon} />
          <div className={styles.loadingText}>加载文章中...</div>
        </div>
      </div>
    </div>
  );

  // 渲染填空测试页面
  const renderTestingPage = () => (
    <div className={styles.testingPage}>
      {article && (
        <Card className={styles.clozeCard}>
          <ArticleHeader
            title={article.title}
            wordCount={article.words.length}
            difficulty={article.difficulty || 'EASY'}
            articleType={article.articleType || 'STORY'}
            length={article.length || 'SHORT'}
            usedWords={article.words.map(w => w.word)}
            createdAt={article.createdAt || new Date().toISOString()}
            showWords={false}
          />

          <Divider />

          <div className={styles.clozeText}>
            <InteractiveText
              content={article.content}
              words={interactiveWords}
              renderToken={renderClozeToken}
              features={{
                translation: true,
                grammarAnalysis: true
              }}
            />
          </div>
        </Card>
      )}

      <div className={styles.testingFooter}>
        {!isSubmitted ? (
          <Button
            color="primary"
            size="large"
            onClick={handleSubmitTest}
            disabled={clozeBlanks.some(blank => !blank.userAnswer)}
            style={{ width: '100%' }}
          >
            提交答案
          </Button>
        ) : (
          <Button
            color="default"
            size="large"
            onClick={handleRestart}
            style={{ width: '100%' }}
          >
            <AiOutlineReload style={{ marginRight: 8 }} />
            重新开始
          </Button>
        )}
      </div>
    </div>
  );



  // 渲染页面标题
  const getPageTitle = () => {
    switch (pageStatus) {
      case 'loading': return '加载中';
      case 'testing': return '填空测试';
      default: return '填空阅读';
    }
  };

  // 渲染返回按钮
  const handleBack = () => {
    navigate(-1);
  };

  return (
    <PageView
      className={styles.clozeReadingPage}
      appBar={
        <AppBar
          title={getPageTitle()}
          onBack={handleBack}
          automaticallyImplyLeading={true}
          className={styles.pageHeader}
        />
      }
    >
      <div className={styles.pageContent}>
        {loading && renderLoadingPage()}
        {!loading && pageStatus === 'testing' && renderTestingPage()}
      </div>
    </PageView>
  );
};

export default ClozeReadingPage;
