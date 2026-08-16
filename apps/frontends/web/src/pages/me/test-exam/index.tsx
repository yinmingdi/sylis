import { Button, Card, Result, Toast, SpinLoading, Dialog } from 'antd-mobile';
import { useState, useRef, useEffect } from 'react';
import { AiOutlineReload, AiOutlineHome } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import type { TestQuestionDto, TestAnswerDto } from '@/legacy-dto';

import styles from './index.module.less';
import { AppBar } from '../../../components/app-bar';
import { PageView } from '../../../components/view';
import WordQuizChoice from '../../../components/word-quiz-choice';
import {
  startVocabularyTest,
  completeVocabularyTest,
} from '../../../modules/vocabulary/api';

interface TestResult {
  testId: string;
  score: number;
  correctCount: number;
  totalCount: number;
  level: string;
  estimatedVocabulary: number;
  timeSpent: number;
  completedAt: Date;
}

const VocabularyTestExam = () => {
  const navigate = useNavigate();
  const [currentPhase, setCurrentPhase] = useState<
    'loading' | 'testing' | 'result'
  >('loading');
  const [testId, setTestId] = useState<string>('');
  const [questions, setQuestions] = useState<TestQuestionDto[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<TestAnswerDto[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const questionStartTime = useRef<number>(Date.now());
  const hasStartedRef = useRef(false);

  // 进入页面自动开始测试
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 开始测试
  const startTest = async () => {
    try {
      const res = await startVocabularyTest({ questionCount: 10 });
      setTestId(res.data.testId);
      setQuestions(res.data.questions);
      setAnswers([]);
      setCurrentQuestionIndex(0);
      questionStartTime.current = Date.now();
      setCurrentPhase('testing');
    } catch (error: any) {
      Toast.show({ content: error.message || '开始测试失败', icon: 'fail' });
      navigate('/vocabulary-test');
    }
  };

  // 处理答题
  const handleAnswer = (selectedWordId: string) => {
    const currentQuestion = questions[currentQuestionIndex];
    const timeSpent = Math.floor(
      (Date.now() - questionStartTime.current) / 1000,
    );

    const answer: TestAnswerDto = {
      wordId: currentQuestion.word.id,
      questionWord: currentQuestion.word.headword,
      selectedWordId,
      answerWordId: currentQuestion.quizData.answerWordId,
      difficulty: currentQuestion.difficulty,
      timeSpent,
    };

    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);

    if (currentQuestionIndex + 1 < questions.length) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      questionStartTime.current = Date.now();
    } else {
      finishTest(newAnswers);
    }
  };

  // 完成测试
  const finishTest = async (allAnswers: TestAnswerDto[]) => {
    try {
      const res = await completeVocabularyTest(testId, { answers: allAnswers });
      setTestResult(res.data);
      setCurrentPhase('result');
      Toast.show({ content: '测试完成！', icon: 'success' });
    } catch (error: any) {
      Toast.show({ content: error.message || '提交测试失败', icon: 'fail' });
    }
  };

  // 重新测试
  const restartTest = () => {
    navigate('/vocabulary-test-exam', { replace: true });
    window.location.reload();
  };

  // 渲染加载页面
  const renderLoading = () => (
    <div className={styles.loadingSection}>
      <SpinLoading style={{ '--size': '48px' }} />
      <p>正在生成测试题目...</p>
    </div>
  );

  // 渲染测试页面
  const renderTesting = () => {
    if (questions.length === 0) return null;

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return null;

    return (
      <WordQuizChoice
        key={currentQuestion.word.id}
        word={currentQuestion.word}
        quizData={currentQuestion.quizData}
        currentVoice="us"
        onAnswer={handleAnswer}
        showActions={true}
      />
    );
  };

  // 渲染进度条
  const renderProgress = () => {
    if (currentPhase !== 'testing' || questions.length === 0) return null;

    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    return (
      <div className={styles.testProgress}>
        <div className={styles.progressBarWrapper}>
          <div
            className={styles.progressBar}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  };

  // 渲染结果页面
  const renderResult = () => {
    if (!testResult) return null;

    return (
      <div className={styles.resultSection}>
        <Result
          status="success"
          title="测试完成！"
          description="恭喜你完成了词汇量测试"
          className={styles.resultHeader}
        />

        <Card className={styles.scoreCard}>
          <div className={styles.scoreDisplay}>
            <div className={styles.mainScore}>
              <span className={styles.scoreNumber}>{testResult.score}</span>
              <span className={styles.scoreUnit}>分</span>
            </div>
            <div className={styles.scoreDetails}>
              <div className={styles.scoreItem}>
                <span className={styles.scoreLabel}>正确率</span>
                <span className={styles.scoreValue}>
                  {testResult.correctCount}/{testResult.totalCount}
                </span>
              </div>
              <div className={styles.scoreItem}>
                <span className={styles.scoreLabel}>用时</span>
                <span className={styles.scoreValue}>
                  {Math.floor(testResult.timeSpent / 60)}分
                  {testResult.timeSpent % 60}秒
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className={styles.assessmentCard}>
          <h3>水平评估</h3>
          <div className={styles.levelInfo}>
            <div className={styles.levelBadge}>{testResult.level}</div>
            <div className={styles.vocabularyEstimate}>
              <span className={styles.estimateLabel}>预估词汇量</span>
              <span className={styles.estimateValue}>
                {testResult.estimatedVocabulary.toLocaleString()} 词
              </span>
            </div>
          </div>

          <div className={styles.recommendations}>
            <h4>学习建议</h4>
            <div className={styles.suggestionList}>
              {testResult.estimatedVocabulary >= 8000 ? (
                <>
                  <div className={styles.suggestion}>
                    • 词汇量已达到精通水平，建议专注于专业领域词汇
                  </div>
                  <div className={styles.suggestion}>
                    • 可以阅读学术论文、专业文献等高难度材料
                  </div>
                  <div className={styles.suggestion}>
                    • 练习在专业语境中理解和使用词汇
                  </div>
                </>
              ) : testResult.estimatedVocabulary >= 5000 ? (
                <>
                  <div className={styles.suggestion}>
                    • 词汇基础扎实，建议学习更高级的词汇
                  </div>
                  <div className={styles.suggestion}>
                    • 可以开始阅读英文原版书籍和文章
                  </div>
                  <div className={styles.suggestion}>
                    • 练习在语境中理解和使用词汇
                  </div>
                </>
              ) : testResult.estimatedVocabulary >= 3000 ? (
                <>
                  <div className={styles.suggestion}>
                    • 继续巩固基础词汇，扩大词汇量
                  </div>
                  <div className={styles.suggestion}>
                    • 建议每天学习20-30个新单词
                  </div>
                  <div className={styles.suggestion}>
                    • 多做词汇练习和阅读理解
                  </div>
                </>
              ) : testResult.estimatedVocabulary >= 1500 ? (
                <>
                  <div className={styles.suggestion}>
                    • 从基础词汇开始，打好词汇基础
                  </div>
                  <div className={styles.suggestion}>
                    • 建议每天学习15-20个常用单词
                  </div>
                  <div className={styles.suggestion}>
                    • 通过词根词缀学习提高效率
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.suggestion}>
                    • 建议从最基础的高频词开始学习
                  </div>
                  <div className={styles.suggestion}>
                    • 每天学习10-15个最常用单词
                  </div>
                  <div className={styles.suggestion}>• 多听多读，培养语感</div>
                </>
              )}
            </div>
          </div>
        </Card>

        <div className={styles.actionButtons}>
          <Button
            block
            color="primary"
            size="large"
            onClick={restartTest}
            className={styles.retestButton}
          >
            <AiOutlineReload />
            重新测试
          </Button>
          <Button
            block
            fill="outline"
            size="large"
            onClick={() => navigate('/vocabulary-test')}
            className={styles.homeButton}
          >
            <AiOutlineHome />
            返回首页
          </Button>
        </div>
      </div>
    );
  };

  const getHeaderTitle = () => {
    if (currentPhase === 'loading') return '准备测试';
    if (currentPhase === 'testing') return '词汇量测试';
    return '测试结果';
  };

  const handleBack = () => {
    if (currentPhase === 'testing') {
      Dialog.confirm({
        content: '测试进行中，确定要退出吗？退出后测试进度将不会保存。',
        confirmText: '确定退出',
        cancelText: '继续测试',
        onConfirm: () => {
          navigate('/vocabulary-test');
        },
      });
    } else {
      navigate('/vocabulary-test');
    }
  };

  return (
    <PageView
      className={styles.testPage}
      appBar={<AppBar title={getHeaderTitle()} onBack={handleBack} />}
    >
      {renderProgress()}
      <div className={styles.content}>
        {currentPhase === 'loading' && renderLoading()}
        {currentPhase === 'testing' && renderTesting()}
        {currentPhase === 'result' && renderResult()}
      </div>
    </PageView>
  );
};

export default VocabularyTestExam;
