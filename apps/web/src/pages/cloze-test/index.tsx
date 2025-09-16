import {
  Button,
  Radio,
  ProgressBar,
  Card,
  Toast,
  DotLoading,
  Space,
  Popup,
  Input
} from 'antd-mobile';
import React, { useState, useEffect, useRef } from 'react';
import {
  AiOutlineReload,
  AiOutlineEdit,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineBulb
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { aiService, type StoryGenerationProgress, AI_CONFIG, type ClozeArticle } from '../../network/ai';

// 难度级别定义
const DIFFICULTY_LEVELS = [
  {
    value: 'beginner',
    label: '初级',
    description: '简单词汇，基础语法',
    wordCount: '100-200词'
  },
  {
    value: 'intermediate',
    label: '中级',
    description: '常用词汇，复合句型',
    wordCount: '200-300词'
  },
  {
    value: 'advanced',
    label: '高级',
    description: '高级词汇，复杂语法',
    wordCount: '300-400词'
  }
];

// 主题类型定义
const THEMES = [
  { value: 'daily_life', label: '日常生活', emoji: '🏠' },
  { value: 'science', label: '科学技术', emoji: '🔬' },
  { value: 'travel', label: '旅行探险', emoji: '✈️' },
  { value: 'business', label: '商务职场', emoji: '💼' },
  { value: 'education', label: '教育学习', emoji: '📚' },
  { value: 'environment', label: '环境保护', emoji: '🌱' },
  { value: 'culture', label: '文化艺术', emoji: '🎨' },
  { value: 'sports', label: '体育运动', emoji: '⚽' }
];



// 页面状态类型
type PageStatus = 'selection' | 'loading' | 'answering' | 'result';

// 测试结果
interface TestResult {
  score: number;
  correctCount: number;
  totalCount: number;
  timeSpent: number;
  accuracy: number;
}

const ClozeTestPage: React.FC = () => {
  const navigate = useNavigate();
  const [pageStatus, setPageStatus] = useState<PageStatus>('selection');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('intermediate');
  const [selectedTheme, setSelectedTheme] = useState<string>('daily_life');
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>('');

  // 文章和题目相关状态
  const [article, setArticle] = useState<ClozeArticle | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: number }>({});
  const [startTime, setStartTime] = useState<number>(0);
  const [timeSpent, setTimeSpent] = useState<number>(0);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // 弹窗状态
  const [showHintPopup, setShowHintPopup] = useState(false);
  const [showCustomTheme, setShowCustomTheme] = useState(false);
  const [customTheme, setCustomTheme] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 计时器
  useEffect(() => {
    if (pageStatus === 'answering' && startTime > 0) {
      timerRef.current = setInterval(() => {
        setTimeSpent(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [pageStatus, startTime]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (aiService.isRequesting()) {
        aiService.abort();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // 生成短文填词
  const generateClozeTest = async () => {
    // 检查AI配置
    if (!AI_CONFIG.apiKey) {
      Toast.show({
        content: 'AI服务未配置，请检查设置',
        icon: 'fail'
      });
      return;
    }

    setIsGenerating(true);
    setPageStatus('loading');
    setProgress(0);
    setCurrentStage('正在准备...');
    setError('');

    // 创建取消控制器
    abortControllerRef.current = new AbortController();

    try {
      // 获取选中的主题信息
      const selectedThemeInfo = THEMES.find(t => t.value === selectedTheme);
      const themeText = showCustomTheme ? customTheme : selectedThemeInfo?.label || '日常生活';

      // 调用AI服务生成短文填词
      await aiService.generateClozeTestStream(
        {
          difficulty: selectedDifficulty as 'beginner' | 'intermediate' | 'advanced',
          theme: themeText,
          questionCount: 10
        },
        // 进度回调
        (progress: StoryGenerationProgress) => {
          setProgress(progress.progress);
          setCurrentStage(progress.message);
        },
        // 内容回调
        (clozeData: ClozeArticle) => {
          setArticle(clozeData);
        }
      );

      // 生成完成
      setProgress(100);
      setCurrentStage('短文填词生成完成！');
      setPageStatus('answering');
      setIsGenerating(false);
      setStartTime(Date.now());

      Toast.show({
        content: '短文填词生成完成！',
        icon: 'success'
      });

    } catch (error: any) {
      console.error('短文填词生成失败:', error);
      setIsGenerating(false);
      setError(error.message || '生成短文填词时出现错误');

      // 如果不是用户主动取消，则显示错误
      if (error.name !== 'AbortError') {
        Toast.show({
          content: error.message || '生成短文填词失败，请重试',
          icon: 'fail'
        });

        // 返回选择页面
        setPageStatus('selection');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  // 取消生成
  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (aiService.isRequesting()) {
      aiService.abort();
    }
    setIsGenerating(false);
    setPageStatus('selection');
    setProgress(0);
    setError('');
    setCurrentStage('');

    Toast.show({
      content: '已取消生成',
      icon: 'success'
    });
  };

  // 处理答案选择
  const handleAnswerSelect = (questionId: number, optionIndex: number) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: optionIndex
    }));
  };

  // 提交答案
  const submitAnswers = () => {
    if (!article) return;

    const correctCount = article.questions.reduce((count, question) => {
      return count + (answers[question.id] === question.correctIndex ? 1 : 0);
    }, 0);

    const totalCount = article.questions.length;
    const accuracy = (correctCount / totalCount) * 100;
    const finalTimeSpent = Math.floor((Date.now() - startTime) / 1000);

    const result: TestResult = {
      score: Math.round(accuracy),
      correctCount,
      totalCount,
      timeSpent: finalTimeSpent,
      accuracy
    };

    setTestResult(result);
    setPageStatus('result');
    setTimeSpent(finalTimeSpent);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 重新开始
  const handleRestart = () => {
    setPageStatus('selection');
    setArticle(null);
    setAnswers({});
    setTestResult(null);
    setTimeSpent(0);
    setStartTime(0);
    setCurrentQuestionIndex(0);
    setProgress(0);
    setError('');
    setCurrentStage('');
  };

  // 格式化时间
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 渲染选择页面
  const renderSelectionPage = () => (
    <div className={styles.selectionPage}>
      <div className={styles.selectionHeader}>
        <h3>短文填词练习</h3>
        <p>选择难度和主题，AI将为您生成个性化的英语短文填词练习</p>
      </div>

      <div className={styles.configSection}>
        <div className={styles.sectionTitle}>
          <AiOutlineEdit className={styles.sectionIcon} />
          选择难度级别
        </div>
        <div className={styles.difficultyRadios}>
          <Radio.Group
            value={selectedDifficulty}
            onChange={(value) => setSelectedDifficulty(value as string)}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {DIFFICULTY_LEVELS.map((level) => (
                <Radio
                  key={level.value}
                  value={level.value}
                  className={styles.difficultyOption}
                >
                  <div className={styles.optionContent}>
                    <div className={styles.optionMain}>
                      <span className={styles.optionLabel}>{level.label}</span>
                      <span className={styles.optionWords}>{level.wordCount}</span>
                    </div>
                    <div className={styles.optionDesc}>{level.description}</div>
                  </div>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </div>
      </div>

      <div className={styles.configSection}>
        <div className={styles.sectionTitle}>
          <AiOutlineBulb className={styles.sectionIcon} />
          选择文章主题
        </div>
        <div className={styles.themeGrid}>
          {THEMES.map((theme) => (
            <div
              key={theme.value}
              className={`${styles.themeCard} ${selectedTheme === theme.value ? styles.selected : ''}`}
              onClick={() => {
                setSelectedTheme(theme.value);
                setShowCustomTheme(false);
              }}
            >
              <div className={styles.themeEmoji}>{theme.emoji}</div>
              <div className={styles.themeLabel}>{theme.label}</div>
            </div>
          ))}
          <div
            className={`${styles.themeCard} ${styles.customTheme} ${showCustomTheme ? styles.selected : ''}`}
            onClick={() => {
              setShowCustomTheme(true);
              setSelectedTheme('custom');
            }}
          >
            <div className={styles.themeEmoji}>✏️</div>
            <div className={styles.themeLabel}>自定义</div>
          </div>
        </div>

        {showCustomTheme && (
          <div className={styles.customThemeInput}>
            <Input
              placeholder="请输入自定义主题，如：环保生活、科技创新等"
              value={customTheme}
              onChange={setCustomTheme}
              maxLength={20}
            />
          </div>
        )}
      </div>

      <div className={styles.selectionFooter}>
        <Button
          color="primary"
          block
          size="large"
          onClick={generateClozeTest}
          disabled={isGenerating || (showCustomTheme && !customTheme.trim())}
          loading={isGenerating}
        >
          <AiOutlineEdit style={{ marginRight: 8 }} />
          {isGenerating ? '正在生成...' : '开始练习'}
        </Button>
      </div>
    </div>
  );

  // 渲染加载页面
  const renderLoadingPage = () => (
    <div className={styles.loadingPage}>
      <div className={styles.loadingContent}>
        <div className={styles.loadingIcon}>
          <AiOutlineEdit className={styles.editIcon} />
          <DotLoading color="primary" />
        </div>

        <h3>AI正在生成短文填词...</h3>
        <p>正在为您创建{DIFFICULTY_LEVELS.find(d => d.value === selectedDifficulty)?.label}难度的练习</p>

        <div className={styles.progressSection}>
          <ProgressBar
            percent={progress}
            className={styles.progressBar}
          />
          <div className={styles.progressText}>
            {currentStage || '正在准备...'}
          </div>
        </div>

        <div className={styles.loadingMeta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>难度:</span>
            <span className={styles.metaValue}>
              {DIFFICULTY_LEVELS.find(d => d.value === selectedDifficulty)?.label}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>主题:</span>
            <span className={styles.metaValue}>
              {showCustomTheme ? customTheme : THEMES.find(t => t.value === selectedTheme)?.label}
            </span>
          </div>
        </div>

        <div className={styles.loadingActions}>
          <Button
            color="default"
            size="small"
            onClick={cancelGeneration}
            disabled={!isGenerating}
          >
            取消生成
          </Button>
        </div>

        {error && (
          <div className={styles.errorMessage}>
            ⚠️ {error}
          </div>
        )}
      </div>
    </div>
  );

  // 渲染答题页面
  const renderAnsweringPage = () => {
    if (!article) return null;

    const currentQuestion = article.questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / article.questions.length) * 100;
    const answeredCount = Object.keys(answers).length;

    return (
      <div className={styles.answeringPage}>
        <div className={styles.answeringHeader}>
          <div className={styles.testInfo}>
            <h3>{article.title}</h3>
            <div className={styles.testMeta}>
              <span className={styles.metaItem}>
                <AiOutlineClockCircle />
                {formatTime(timeSpent)}
              </span>
              <span className={styles.metaItem}>
                题目 {currentQuestionIndex + 1}/{article.questions.length}
              </span>
              <span className={styles.metaItem}>
                已答 {answeredCount}/{article.questions.length}
              </span>
            </div>
          </div>
          <ProgressBar percent={progress} className={styles.questionProgress} />
        </div>

        <div className={styles.articleSection}>
          <Card className={styles.articleCard}>
            <div className={styles.articleContent}>
              <div className={styles.articleText}>
                {article.content.split(/(\[\d+\])/).map((part, index) => {
                  // 检查是否是填空标记
                  const match = part.match(/\[(\d+)\]/);
                  if (match) {
                    const questionIndex = parseInt(match[1]) - 1;
                    const question = article.questions[questionIndex];
                    const userAnswer = answers[question?.id];

                    return (
                      <span
                        key={index}
                        className={`${styles.blankSpace} ${currentQuestionIndex === questionIndex ? styles.currentBlank : ''}`}
                      >
                        {userAnswer !== undefined ? question?.options[userAnswer] : `___${match[1]}___`}
                      </span>
                    );
                  }
                  return part;
                })}
              </div>
            </div>
          </Card>
        </div>

        <div className={styles.questionSection}>
          <Card className={styles.questionCard}>
            <div className={styles.questionHeader}>
              <span className={styles.questionNumber}>第 {currentQuestionIndex + 1} 题</span>
              <Button
                size="mini"
                fill="none"
                onClick={() => setShowHintPopup(true)}
              >
                <AiOutlineBulb />
                提示
              </Button>
            </div>

            <div className={styles.questionText}>
              {currentQuestion.question}
            </div>

            <Radio.Group
              value={answers[currentQuestion.id]}
              onChange={(value) => handleAnswerSelect(currentQuestion.id, value as number)}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {currentQuestion.options.map((option, index) => (
                  <Radio
                    key={index}
                    value={index}
                    className={styles.optionRadio}
                  >
                    <span className={styles.optionText}>{option}</span>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </Card>
        </div>

        <div className={styles.answeringFooter}>
          <Button
            color="default"
            size="large"
            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            style={{ flex: 1 }}
          >
            上一题
          </Button>

          {currentQuestionIndex < article.questions.length - 1 ? (
            <Button
              color="primary"
              size="large"
              onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
              style={{ flex: 1, marginLeft: 12 }}
            >
              下一题
            </Button>
          ) : (
            <Button
              color="primary"
              size="large"
              onClick={submitAnswers}
              disabled={answeredCount < article.questions.length}
              style={{ flex: 1, marginLeft: 12 }}
            >
              <AiOutlineCheckCircle style={{ marginRight: 8 }} />
              提交答案
            </Button>
          )}
        </div>
      </div>
    );
  };

  // 渲染结果页面
  const renderResultPage = () => {
    if (!testResult || !article) return null;

    const getScoreColor = (score: number) => {
      if (score >= 80) return styles.scoreExcellent;
      if (score >= 60) return styles.scoreGood;
      return styles.scoreNeedsWork;
    };

    const getPerformanceText = (score: number) => {
      if (score >= 90) return '优秀';
      if (score >= 80) return '良好';
      if (score >= 60) return '及格';
      return '需要努力';
    };

    return (
      <div className={styles.resultPage}>
        <div className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <div className={`${styles.scoreDisplay} ${getScoreColor(testResult.score)}`}>
              <div className={styles.scoreNumber}>{testResult.score}</div>
              <div className={styles.scoreLabel}>分</div>
            </div>
            <div className={styles.performanceText}>
              {getPerformanceText(testResult.score)}
            </div>
          </div>

          <div className={styles.resultStats}>
            <div className={styles.statItem}>
              <div className={styles.statValue}>{testResult.correctCount}</div>
              <div className={styles.statLabel}>答对题数</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statValue}>{testResult.totalCount}</div>
              <div className={styles.statLabel}>总题数</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statValue}>{formatTime(testResult.timeSpent)}</div>
              <div className={styles.statLabel}>用时</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statValue}>{testResult.accuracy.toFixed(1)}%</div>
              <div className={styles.statLabel}>正确率</div>
            </div>
          </div>

          <div className={styles.resultAnalysis}>
            <h4>详细分析</h4>
            <div className={styles.questionReview}>
              {article.questions.map((question, index) => {
                const userAnswer = answers[question.id];
                const isCorrect = userAnswer === question.correctIndex;

                return (
                  <div key={question.id} className={styles.reviewItem}>
                    <div className={styles.reviewHeader}>
                      <span className={styles.reviewNumber}>第{index + 1}题</span>
                      <span className={`${styles.reviewStatus} ${isCorrect ? styles.correct : styles.incorrect}`}>
                        {isCorrect ? '✓' : '✗'}
                      </span>
                    </div>
                    <div className={styles.reviewQuestion}>{question.question}</div>
                    <div className={styles.reviewAnswer}>
                      <div className={styles.answerItem}>
                        您的答案: <span className={isCorrect ? styles.correctAnswer : styles.wrongAnswer}>
                          {userAnswer !== undefined ? question.options[userAnswer] : '未作答'}
                        </span>
                      </div>
                      {!isCorrect && (
                        <div className={styles.answerItem}>
                          正确答案: <span className={styles.correctAnswer}>
                            {question.options[question.correctIndex]}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.resultFooter}>
          <Button
            color="default"
            size="large"
            onClick={handleRestart}
            style={{ flex: 1 }}
          >
            <AiOutlineReload style={{ marginRight: 8 }} />
            重新练习
          </Button>
          <Button
            color="primary"
            size="large"
            onClick={() => navigate('/word-learning')}
            style={{ flex: 1, marginLeft: 12 }}
          >
            继续学习
          </Button>
        </div>
      </div>
    );
  };

  // 渲染页面标题
  const getPageTitle = () => {
    switch (pageStatus) {
      case 'selection': return '短文填词';
      case 'loading': return 'AI生成中';
      case 'answering': return article?.title || '短文填词练习';
      case 'result': return '测试结果';
      default: return '短文填词';
    }
  };

  // 渲染返回按钮处理
  const handleBack = () => {
    if (pageStatus === 'answering' || pageStatus === 'result') {
      setPageStatus('selection');
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={styles.clozeTestPage}>
      <PageHeader
        title={getPageTitle()}
        showBack={true}
        onBack={handleBack}
        className={styles.pageHeader}
      />

      <div className={styles.pageContent}>
        {pageStatus === 'selection' && renderSelectionPage()}
        {pageStatus === 'loading' && renderLoadingPage()}
        {pageStatus === 'answering' && renderAnsweringPage()}
        {pageStatus === 'result' && renderResultPage()}
      </div>

      {/* 提示弹窗 */}
      <Popup
        visible={showHintPopup}
        onMaskClick={() => setShowHintPopup(false)}
        position="bottom"
        bodyStyle={{ padding: '20px' }}
      >
        <div className={styles.hintPopup}>
          <h4>答题提示</h4>
          <p>仔细阅读上下文，理解句子的完整含义，选择最符合语法和语义的选项。</p>
          <Button
            block
            color="primary"
            onClick={() => setShowHintPopup(false)}
          >
            知道了
          </Button>
        </div>
      </Popup>
    </div>
  );
};

export default ClozeTestPage;
