import type { Meta, StoryObj } from '@storybook/react';
import type { QuizChoiceDataDto, QuizWordInfoDto } from '@sylis/shared/dto';
import React, { useRef } from 'react';

import WordQuizChoice, { type WordQuizChoiceRef } from './WordQuizChoice';

const meta: Meta<typeof WordQuizChoice> = {
  title: 'Components/WordQuizChoice',
  component: WordQuizChoice,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: '单词选择题组件，用户需要根据单词选择正确的释义。支持答案反馈、美音/英音切换和语音播放。',
      },
    },
  },
  argTypes: {
    currentVoice: {
      control: { type: 'select' },
      options: ['us', 'uk'],
      description: '语音类型（美音/英音）',
    },
    onAnswer: {
      action: 'answered',
      description: '答题回调函数',
    },
    onPlayPronunciation: {
      action: 'playPronunciation',
      description: '播放发音回调函数',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 基础示例
export const Default: Story = {
  args: {
    word: {
      id: 'word-1',
      headword: 'abandon',
      usPhonetic: '/əˈbændən/',
      ukPhonetic: '/əˈbændən/',
    } as QuizWordInfoDto,
    quizData: {
      id: 'quiz-1',
      questionId: 'q-1',
      wordId: 'word-1',
      answerWordId: 'word-1',
      options: [
        { id: 'opt-1', wordId: 'word-1', headword: 'abandon', meaningCn: '放弃；抛弃', partOfSpeech: 'v.' },
        { id: 'opt-2', wordId: 'word-2', headword: 'accept', meaningCn: '接受；承认', partOfSpeech: 'v.' },
        { id: 'opt-3', wordId: 'word-3', headword: 'acquire', meaningCn: '获得；得到', partOfSpeech: 'v.' },
        { id: 'opt-4', wordId: 'word-4', headword: 'accomplish', meaningCn: '完成；实现', partOfSpeech: 'v.' },
      ],
    } as QuizChoiceDataDto,
    currentVoice: 'us',
  },
};

// 英音模式
export const UKVoice: Story = {
  args: {
    word: {
      id: 'word-5',
      headword: 'achieve',
      usPhonetic: '/əˈtʃiːv/',
      ukPhonetic: '/əˈtʃiːv/',
    } as QuizWordInfoDto,
    quizData: {
      id: 'quiz-2',
      questionId: 'q-2',
      wordId: 'word-5',
      answerWordId: 'word-5',
      options: [
        { id: 'opt-5', wordId: 'word-5', headword: 'achieve', meaningCn: '实现；达到', partOfSpeech: 'v.' },
        { id: 'opt-6', wordId: 'word-6', headword: 'fail', meaningCn: '失败；挫败', partOfSpeech: 'v.' },
        { id: 'opt-7', wordId: 'word-7', headword: 'attempt', meaningCn: '尝试；试图', partOfSpeech: 'v.' },
        { id: 'opt-8', wordId: 'word-8', headword: 'abandon', meaningCn: '放弃；抛弃', partOfSpeech: 'v.' },
      ],
    } as QuizChoiceDataDto,
    currentVoice: 'uk',
  },
};

// 三个选项
export const ThreeOptions: Story = {
  args: {
    word: {
      id: 'word-9',
      headword: 'ancient',
      usPhonetic: '/ˈeɪnʃənt/',
      ukPhonetic: '/ˈeɪnʃənt/',
    } as QuizWordInfoDto,
    quizData: {
      id: 'quiz-3',
      questionId: 'q-3',
      wordId: 'word-9',
      answerWordId: 'word-9',
      options: [
        { id: 'opt-9', wordId: 'word-9', headword: 'ancient', meaningCn: '古代的；古老的', partOfSpeech: 'adj.' },
        { id: 'opt-10', wordId: 'word-10', headword: 'modern', meaningCn: '现代的；新式的', partOfSpeech: 'adj.' },
        { id: 'opt-11', wordId: 'word-11', headword: 'young', meaningCn: '年轻的；幼小的', partOfSpeech: 'adj.' },
      ],
    } as QuizChoiceDataDto,
    currentVoice: 'us',
  },
};

// 六个选项（较多选项）
export const SixOptions: Story = {
  args: {
    word: {
      id: 'word-12',
      headword: 'beautiful',
      usPhonetic: '/ˈbjuːtɪfl/',
      ukPhonetic: '/ˈbjuːtɪfl/',
    } as QuizWordInfoDto,
    quizData: {
      id: 'quiz-4',
      questionId: 'q-4',
      wordId: 'word-12',
      answerWordId: 'word-12',
      options: [
        { id: 'opt-12', wordId: 'word-12', headword: 'beautiful', meaningCn: '美丽的；漂亮的', partOfSpeech: 'adj.' },
        { id: 'opt-13', wordId: 'word-13', headword: 'ugly', meaningCn: '丑陋的；难看的', partOfSpeech: 'adj.' },
        { id: 'opt-14', wordId: 'word-14', headword: 'ordinary', meaningCn: '普通的；平凡的', partOfSpeech: 'adj.' },
        { id: 'opt-15', wordId: 'word-15', headword: 'strange', meaningCn: '奇怪的；古怪的', partOfSpeech: 'adj.' },
        { id: 'opt-16', wordId: 'word-16', headword: 'dangerous', meaningCn: '危险的；冒险的', partOfSpeech: 'adj.' },
        { id: 'opt-17', wordId: 'word-17', headword: 'comfortable', meaningCn: '舒适的；安逸的', partOfSpeech: 'adj.' },
      ],
    } as QuizChoiceDataDto,
    currentVoice: 'us',
  },
};

// 长释义选项
export const LongDefinitions: Story = {
  args: {
    word: {
      id: 'word-18',
      headword: 'comprehensive',
      usPhonetic: '/ˌkɑːmprɪˈhensɪv/',
      ukPhonetic: '/ˌkɒmprɪˈhensɪv/',
    } as QuizWordInfoDto,
    quizData: {
      id: 'quiz-5',
      questionId: 'q-5',
      wordId: 'word-18',
      answerWordId: 'word-18',
      options: [
        { id: 'opt-18', wordId: 'word-18', headword: 'comprehensive', meaningCn: '综合的；全面的；详尽的；广泛的', partOfSpeech: 'adj.' },
        { id: 'opt-19', wordId: 'word-19', headword: 'simple', meaningCn: '简单的；容易的；基础的；初级的', partOfSpeech: 'adj.' },
        { id: 'opt-20', wordId: 'word-20', headword: 'partial', meaningCn: '部分的；不完全的；局部的；片面的', partOfSpeech: 'adj.' },
        { id: 'opt-21', wordId: 'word-21', headword: 'specific', meaningCn: '具体的；特定的；明确的；详细的', partOfSpeech: 'adj.' },
      ],
    } as QuizChoiceDataDto,
    currentVoice: 'us',
  },
};

// 无音标
export const NoPhonetic: Story = {
  args: {
    word: {
      id: 'word-22',
      headword: 'hello',
    } as QuizWordInfoDto,
    quizData: {
      id: 'quiz-6',
      questionId: 'q-6',
      wordId: 'word-22',
      answerWordId: 'word-22',
      options: [
        { id: 'opt-22', wordId: 'word-22', headword: 'hello', meaningCn: '你好；喂', partOfSpeech: 'int.' },
        { id: 'opt-23', wordId: 'word-23', headword: 'goodbye', meaningCn: '再见；拜拜', partOfSpeech: 'int.' },
        { id: 'opt-24', wordId: 'word-24', headword: 'thanks', meaningCn: '谢谢；感谢', partOfSpeech: 'int.' },
        { id: 'opt-25', wordId: 'word-25', headword: 'sorry', meaningCn: '对不起；抱歉', partOfSpeech: 'int.' },
      ],
    } as QuizChoiceDataDto,
    currentVoice: 'us',
  },
};

// 带完整回调的示例
export const WithCallbacks: Story = {
  args: {
    word: {
      id: 'word-26',
      headword: 'example',
      usPhonetic: '/ɪɡˈzæmpəl/',
      ukPhonetic: '/ɪɡˈzɑːmpəl/',
    } as QuizWordInfoDto,
    quizData: {
      id: 'quiz-7',
      questionId: 'q-7',
      wordId: 'word-26',
      answerWordId: 'word-26',
      options: [
        { id: 'opt-26', wordId: 'word-26', headword: 'example', meaningCn: '例子；示例；榜样', partOfSpeech: 'n.' },
        { id: 'opt-27', wordId: 'word-27', headword: 'problem', meaningCn: '问题；难题；疑问', partOfSpeech: 'n.' },
        { id: 'opt-28', wordId: 'word-28', headword: 'answer', meaningCn: '答案；回答；解决方案', partOfSpeech: 'n.' },
        { id: 'opt-29', wordId: 'word-29', headword: 'reason', meaningCn: '理由；原因；解释', partOfSpeech: 'n.' },
      ],
    } as QuizChoiceDataDto,
    currentVoice: 'us',
    onAnswer: (selectedWordId, isCorrect) => {
      console.log(`选择的单词ID: ${selectedWordId}, 答案${isCorrect ? '正确' : '错误'}`);
    },
    onPlayPronunciation: () => {
      console.log('播放单词发音');
    },
  },
};

// 多题练习示例
export const MultipleQuizzes: Story = {
  render: () => {
    const quizzes: Array<{ word: QuizWordInfoDto; quizData: QuizChoiceDataDto }> = [
      {
        word: {
          id: 'word-30',
          headword: 'apple',
          usPhonetic: '/ˈæpl/',
          ukPhonetic: '/ˈæpl/',
        },
        quizData: {
          id: 'quiz-8',
          questionId: 'q-8',
          wordId: 'word-30',
          answerWordId: 'word-30',
          options: [
            { id: 'opt-30', wordId: 'word-30', headword: 'apple', meaningCn: '苹果', partOfSpeech: 'n.' },
            { id: 'opt-31', wordId: 'word-31', headword: 'banana', meaningCn: '香蕉', partOfSpeech: 'n.' },
            { id: 'opt-32', wordId: 'word-32', headword: 'orange', meaningCn: '橙子', partOfSpeech: 'n.' },
            { id: 'opt-33', wordId: 'word-33', headword: 'watermelon', meaningCn: '西瓜', partOfSpeech: 'n.' },
          ],
        },
      },
      {
        word: {
          id: 'word-34',
          headword: 'book',
          usPhonetic: '/bʊk/',
          ukPhonetic: '/bʊk/',
        },
        quizData: {
          id: 'quiz-9',
          questionId: 'q-9',
          wordId: 'word-34',
          answerWordId: 'word-34',
          options: [
            { id: 'opt-34', wordId: 'word-34', headword: 'book', meaningCn: '书；书籍', partOfSpeech: 'n.' },
            { id: 'opt-35', wordId: 'word-35', headword: 'pen', meaningCn: '笔；钢笔', partOfSpeech: 'n.' },
            { id: 'opt-36', wordId: 'word-36', headword: 'desk', meaningCn: '桌子；台子', partOfSpeech: 'n.' },
            { id: 'opt-37', wordId: 'word-37', headword: 'chair', meaningCn: '椅子；座位', partOfSpeech: 'n.' },
          ],
        },
      },
      {
        word: {
          id: 'word-38',
          headword: 'computer',
          usPhonetic: '/kəmˈpjuːtər/',
          ukPhonetic: '/kəmˈpjuːtə/',
        },
        quizData: {
          id: 'quiz-10',
          questionId: 'q-10',
          wordId: 'word-38',
          answerWordId: 'word-38',
          options: [
            { id: 'opt-38', wordId: 'word-38', headword: 'computer', meaningCn: '计算机；电脑', partOfSpeech: 'n.' },
            { id: 'opt-39', wordId: 'word-39', headword: 'phone', meaningCn: '手机；移动电话', partOfSpeech: 'n.' },
            { id: 'opt-40', wordId: 'word-40', headword: 'television', meaningCn: '电视；电视机', partOfSpeech: 'n.' },
            { id: 'opt-41', wordId: 'word-41', headword: 'radio', meaningCn: '收音机；广播', partOfSpeech: 'n.' },
          ],
        },
      },
    ];

    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [score, setScore] = React.useState(0);
    const [totalAnswered, setTotalAnswered] = React.useState(0);

    const handleAnswer = (_selectedWordId: string, isCorrect: boolean) => {
      console.log(`题目 ${currentIndex + 1}: ${isCorrect ? '正确' : '错误'}`);

      if (isCorrect) {
        setScore(score + 1);
      }
      setTotalAnswered(totalAnswered + 1);

      // 延迟1.5秒后自动跳转到下一题
      if (currentIndex < quizzes.length - 1) {
        setTimeout(() => {
          setCurrentIndex(currentIndex + 1);
        }, 1500);
      } else {
        setTimeout(() => {
          console.log(`练习完成！得分: ${isCorrect ? score + 1 : score}/${quizzes.length}`);
        }, 1500);
      }
    };

    const currentQuiz = quizzes[currentIndex];

    return (
      <div>
        <div style={{ padding: '16px', background: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
          <div style={{ fontSize: '14px', color: '#666' }}>
            题目 {currentIndex + 1} / {quizzes.length}
            {totalAnswered > 0 && ` | 得分: ${score}/${totalAnswered}`}
          </div>
        </div>
        <WordQuizChoice
          word={currentQuiz.word}
          quizData={currentQuiz.quizData}
          currentVoice="us"
          onAnswer={handleAnswer}
          onPlayPronunciation={() => console.log(`播放 ${currentQuiz.word.headword} 的发音`)}
        />
      </div>
    );
  },
};

// 带查看答案功能的示例
export const WithViewAnswer: Story = {
  render: () => {
    const quizRef = useRef<WordQuizChoiceRef>(null);
    const [answered, setAnswered] = React.useState(false);

    const handleAnswer = (selectedWordId: string, isCorrect: boolean, isCheated?: boolean) => {
      console.log(`选择的单词ID: ${selectedWordId}, 答案${isCorrect ? '正确' : '错误'}, ${isCheated ? '已查看答案' : '正常作答'}`);
      setAnswered(true);
    };

    const handleViewAnswer = () => {
      quizRef.current?.viewAnswer();
    };

    return (
      <div>
        <div style={{ padding: '16px', background: '#f5f5f5', borderBottom: '1px solid #e0e0e0', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={handleViewAnswer}
            disabled={answered}
            style={{
              padding: '8px 16px',
              backgroundColor: answered ? '#ccc' : '#2ec4b6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: answered ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            查看答案
          </button>
          {answered && quizRef.current?.isCheated && (
            <span style={{ color: '#ff006e', fontSize: '14px' }}>⚠️ 已查看答案，本题不计分</span>
          )}
        </div>
        <WordQuizChoice
          ref={quizRef}
          word={{
            id: 'word-50',
            headword: 'challenge',
            usPhonetic: '/ˈtʃælɪndʒ/',
            ukPhonetic: '/ˈtʃælɪndʒ/',
          }}
          quizData={{
            id: 'quiz-50',
            questionId: 'q-50',
            wordId: 'word-50',
            answerWordId: 'word-50',
            options: [
              { id: 'opt-50', wordId: 'word-50', headword: 'challenge', meaningCn: '挑战；质疑', partOfSpeech: 'v.' },
              { id: 'opt-51', wordId: 'word-51', headword: 'accept', meaningCn: '接受；承认', partOfSpeech: 'v.' },
              { id: 'opt-52', wordId: 'word-52', headword: 'ignore', meaningCn: '忽略；无视', partOfSpeech: 'v.' },
              { id: 'opt-53', wordId: 'word-53', headword: 'avoid', meaningCn: '避免；回避', partOfSpeech: 'v.' },
            ],
          }}
          currentVoice="us"
          onAnswer={handleAnswer}
          onPlayPronunciation={() => console.log('播放发音')}
        />
      </div>
    );
  },
};

