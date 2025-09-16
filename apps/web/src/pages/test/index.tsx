import { Button, ProgressBar, Card, Radio, Space, Modal, Result } from 'antd-mobile';
import { useState, useEffect, useCallback } from 'react';
import {
  AiOutlineClockCircle,
  AiOutlineCheckCircle,
  AiOutlineTrophy,
  AiOutlineReload,
  AiOutlineHome,
  AiOutlineQuestionCircle,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';

interface Question {
  id: string;
  word: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface TestResult {
  score: number;
  correctCount: number;
  totalCount: number;
  level: string;
  estimatedVocabulary: number;
  timeSpent: number;
}

const Test = () => {
  const navigate = useNavigate();
  const [currentPhase, setCurrentPhase] = useState<'intro' | 'testing' | 'result'>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timeSpent, setTimeSpent] = useState(0);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);

  // 模拟题目数据
  const mockQuestions: Question[] = [
    {
      id: '1',
      word: 'abundant',
      options: ['稀少的', '充足的', '困难的', '简单的'],
      correctAnswer: 1,
      difficulty: 'easy'
    },
    {
      id: '2',
      word: 'meticulous',
      options: ['粗心的', '快速的', '细致的', '懒惰的'],
      correctAnswer: 2,
      difficulty: 'medium'
    },
    {
      id: '3',
      word: 'ubiquitous',
      options: ['罕见的', '普遍存在的', '昂贵的', '危险的'],
      correctAnswer: 1,
      difficulty: 'hard'
    },
    {
      id: '4',
      word: 'resilient',
      options: ['脆弱的', '有弹性的', '硬的', '软的'],
      correctAnswer: 1,
      difficulty: 'medium'
    },
    {
      id: '5',
      word: 'ephemeral',
      options: ['永恒的', '短暂的', '重要的', '无关的'],
      correctAnswer: 1,
      difficulty: 'hard'
    },
    {
      id: '6',
      word: 'pragmatic',
      options: ['理想主义的', '实用主义的', '浪漫的', '消极的'],
      correctAnswer: 1,
      difficulty: 'medium'
    },
    {
      id: '7',
      word: 'serendipity',
      options: ['不幸', '意外收获', '计划', '失败'],
      correctAnswer: 1,
      difficulty: 'hard'
    },
    {
      id: '8',
      word: 'tenacious',
      options: ['顽强的', '温和的', '迅速的', '安静的'],
      correctAnswer: 0,
      difficulty: 'medium'
    },
    {
      id: '9',
      word: 'ambiguous',
      options: ['清楚的', '模糊的', '正确的', '错误的'],
      correctAnswer: 1,
      difficulty: 'easy'
    },
    {
      id: '10',
      word: 'vindicate',
      options: ['指责', '证明...正确', '拒绝', '接受'],
      correctAnswer: 1,
      difficulty: 'hard'
    }
  ];

  // 计算测试结果
  const calculateResult = useCallback((answers: number[]): TestResult => {
    let correctCount = 0;

    answers.forEach((answer, index) => {
      if (answer === questions[index].correctAnswer) {
        correctCount++;
        // 根据难度给分
        switch (questions[index].difficulty) {
          case 'easy':
            break;
          case 'medium':
            break;
          case 'hard':
            break;
        }
      }
    });

    const score = Math.round((correctCount / questions.length) * 100);
    let level = '';
    let estimatedVocabulary = 0;

    if (score >= 90) {
      level = '高级水平';
      estimatedVocabulary = 8000;
    } else if (score >= 70) {
      level = '中高级水平';
      estimatedVocabulary = 6000;
    } else if (score >= 50) {
      level = '中级水平';
      estimatedVocabulary = 4000;
    } else if (score >= 30) {
      level = '初中级水平';
      estimatedVocabulary = 2500;
    } else {
      level = '初级水平';
      estimatedVocabulary = 1500;
    }

    return {
      score,
      correctCount,
      totalCount: questions.length,
      level,
      estimatedVocabulary,
      timeSpent
    };
  }, [questions, timeSpent]);

  // 开始测试
  const startTest = () => {
    setQuestions(mockQuestions);
    setCurrentPhase('testing');
    setTimeSpent(0);
  };

  // 计时器
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (currentPhase === 'testing' && timeLeft > 0) {
      timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
        setTimeSpent(prev => prev + 1);
      }, 1000);
    } else if (timeLeft === 0 && currentPhase === 'testing') {
      handleNextQuestion();
    }
    return () => clearTimeout(timer);
  }, [timeLeft, currentPhase]);

  // 下一题
  const handleNextQuestion = () => {
    // 记录答案（超时默认为-1）
    const newAnswers = [...userAnswers, selectedAnswer ?? -1];
    setUserAnswers(newAnswers);

    if (currentQuestionIndex + 1 < questions.length) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setTimeLeft(30);
    } else {
      // 测试结束
      const result = calculateResult(newAnswers);
      setTestResult(result);
      setCurrentPhase('result');
    }
  };

  // 重新测试
  const restartTest = () => {
    setCurrentPhase('intro');
    setCurrentQuestionIndex(0);
    setUserAnswers([]);
    setSelectedAnswer(null);
    setTimeLeft(30);
    setTimeSpent(0);
    setTestResult(null);
  };

  // 退出确认
  const handleExit = () => {
    if (currentPhase === 'testing') {
      setShowExitModal(true);
    } else {
      navigate('/me');
    }
  };

  const renderIntro = () => (
    <div className={styles.introSection}>
      <div className={styles.testHeader}>
        <div className={styles.iconWrapper}>
          <AiOutlineQuestionCircle />
        </div>
        <h1>词汇量测试</h1>
        <p>通过科学的测试方法，准确评估你的英语词汇水平</p>
      </div>

      <Card className={styles.infoCard}>
        <div className={styles.testInfo}>
          <h3>测试说明</h3>
          <div className={styles.infoList}>
            <div className={styles.infoItem}>
              <AiOutlineClockCircle className={styles.infoIcon} />
              <span>每题限时30秒，请快速作答</span>
            </div>
            <div className={styles.infoItem}>
              <AiOutlineCheckCircle className={styles.infoIcon} />
              <span>共10道题，涵盖不同难度等级</span>
            </div>
            <div className={styles.infoItem}>
              <AiOutlineTrophy className={styles.infoIcon} />
              <span>根据结果评估词汇水平和建议</span>
            </div>
          </div>
        </div>
      </Card>

      <div className={styles.actionButtons}>
        <Button
          block
          color="primary"
          size="large"
          onClick={startTest}
          className={styles.startButton}
        >
          开始测试
        </Button>
        <Button
          block
          fill="outline"
          size="large"
          onClick={() => navigate('/me')}
          className={styles.backButton}
        >
          返回
        </Button>
      </div>
    </div>
  );

  const renderTesting = () => {
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    return (
      <div className={styles.testingSection}>
        <div className={styles.testProgress}>
          <div className={styles.progressInfo}>
            <span className={styles.questionCount}>
              {currentQuestionIndex + 1} / {questions.length}
            </span>
            <div className={styles.timeCounter}>
              <AiOutlineClockCircle />
              <span className={timeLeft <= 10 ? styles.timeWarning : ''}>
                {timeLeft}s
              </span>
            </div>
          </div>
          <ProgressBar
            percent={progress}
            className={styles.progressBar}
          />
        </div>

        <Card className={styles.questionCard}>
          <div className={styles.questionHeader}>
            <h2>请选择单词的正确含义</h2>
            <div className={styles.difficultyBadge}>
              {currentQuestion.difficulty === 'easy' && '简单'}
              {currentQuestion.difficulty === 'medium' && '中等'}
              {currentQuestion.difficulty === 'hard' && '困难'}
            </div>
          </div>

          <div className={styles.wordDisplay}>
            <span className={styles.targetWord}>{currentQuestion.word}</span>
          </div>

          <div className={styles.optionsGroup}>
            <Radio.Group
              value={selectedAnswer}
              onChange={(val) => setSelectedAnswer(val as number)}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {currentQuestion.options.map((option, index) => (
                  <Radio
                    key={index}
                    value={index}
                    className={styles.optionItem}
                    block
                  >
                    {option}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
        </Card>

        <div className={styles.actionButtons}>
          <Button
            block
            color="primary"
            size="large"
            disabled={selectedAnswer === null}
            onClick={handleNextQuestion}
            className={styles.nextButton}
          >
            {currentQuestionIndex + 1 === questions.length ? '完成测试' : '下一题'}
          </Button>
          <Button
            block
            fill="outline"
            size="large"
            onClick={handleExit}
            className={styles.exitButton}
          >
            退出测试
          </Button>
        </div>
      </div>
    );
  };

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
                  {Math.floor(testResult.timeSpent / 60)}分{testResult.timeSpent % 60}秒
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className={styles.assessmentCard}>
          <h3>水平评估</h3>
          <div className={styles.levelInfo}>
            <div className={styles.levelBadge}>
              {testResult.level}
            </div>
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
              {testResult.score >= 70 ? (
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
              ) : testResult.score >= 40 ? (
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
              ) : (
                <>
                  <div className={styles.suggestion}>
                    • 从基础词汇开始，打好词汇基础
                  </div>
                  <div className={styles.suggestion}>
                    • 建议每天学习10-15个常用单词
                  </div>
                  <div className={styles.suggestion}>
                    • 通过词根词缀学习提高效率
                  </div>
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
            onClick={() => navigate('/me')}
            className={styles.homeButton}
          >
            <AiOutlineHome />
            返回首页
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.testPage}>
      <div className={styles.content}>
        {currentPhase === 'intro' && renderIntro()}
        {currentPhase === 'testing' && renderTesting()}
        {currentPhase === 'result' && renderResult()}
      </div>

      <Modal
        visible={showExitModal}
        content="确定要退出测试吗？当前进度将会丢失。"
        closeOnAction
        onClose={() => setShowExitModal(false)}
        actions={[
          {
            key: 'cancel',
            text: '继续测试',
          },
          {
            key: 'confirm',
            text: '退出',
            onClick: () => navigate('/me'),
          },
        ]}
      />
    </div>
  );
};

export default Test;
