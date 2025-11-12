import type { QuizChoiceDataDto, QuizWordInfoDto, QuizChoiceOptionDto } from '@sylis/shared/dto';
import { useState, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';

import { WordHeader, UnderlineActions } from '../index';
import styles from './index.module.less';

interface WordQuizChoiceProps {
  word: QuizWordInfoDto;
  quizData: QuizChoiceDataDto;
  currentVoice: 'us' | 'uk';
  onAnswer: (selectedWordId: string, isCorrect: boolean, isCheated?: boolean) => void;
  onPlayPronunciation?: () => void;
  showActions?: boolean; // 是否显示底部按钮（默认true）
  className?: string; // 自定义样式类名
}

// 暴露给父组件的方法
export interface WordQuizChoiceRef {
  viewAnswer: () => void;
  isAnswered: boolean;
  isCheated: boolean;
}

const WordQuizChoice = forwardRef<WordQuizChoiceRef, WordQuizChoiceProps>(({
  word,
  quizData,
  currentVoice,
  onAnswer,
  onPlayPronunciation,
  showActions = true,
  className,
}, ref) => {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCheated, setIsCheated] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false); // ⭐️ 控制是否显示正确答案
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(true);
  const timerRef = useRef<number | null>(null);

  const handleOptionSelect = (optionId: string) => {
    if (isAnswered) return;

    setSelectedOptionId(optionId);
    setIsAnswered(true);

    // 找到选中的选项
    const selectedOption = quizData.options.find(opt => opt.id === optionId);
    if (selectedOption) {
      const isCorrect = selectedOption.wordId === quizData.answerWordId;
      setLastAnswerCorrect(isCorrect);

      console.log('🎯 选择答案:', {
        selectedWord: selectedOption.headword,
        meaningCn: selectedOption.meaningCn,
        isCorrect,
        answerWordId: quizData.answerWordId,
        selectedWordId: selectedOption.wordId,
      });

      // ⭐️ 如果答错了，延迟 1 秒后显示正确答案
      if (!isCorrect) {
        setTimeout(() => {
          setShowCorrectAnswer(true);
        }, 500);
      } else {
        // 答对了立即显示
        setShowCorrectAnswer(true);

        // ⭐️ 如果答对了或作弊了，延迟自动进入下一步
        if (showActions) {
          timerRef.current = setTimeout(() => {
            onAnswer(selectedOption.wordId, isCorrect, isCheated);
          }, 500);
        }
      }

      // 如果不显示按钮（vocabulary-test场景），立即回调
      if (!showActions) {
        onAnswer(selectedOption.wordId, isCorrect, isCheated);
      }
    }
  };

  // 查看答案（作弊）
  const handleViewAnswer = () => {
    if (isAnswered) return;

    setIsCheated(true);
    setLastAnswerCorrect(true);

    // 找到正确答案的选项
    const correctOption = quizData.options.find(opt => opt.wordId === quizData.answerWordId);
    if (correctOption && correctOption.id) {
      setSelectedOptionId(correctOption.id);
      setIsAnswered(true);
      setShowCorrectAnswer(true); // ⭐️ 立即显示正确答案

      // ⭐️ 作弊也会自动跳转
      if (showActions) {
        timerRef.current = setTimeout(() => {
          onAnswer(correctOption.wordId, true, true);
        }, 300);
      } else {
        onAnswer(correctOption.wordId, true, true);
      }
    }
  };

  // 点击底部按钮
  const handleButtonClick = () => {
    if (!isAnswered) {
      // 未答题：查看答案
      handleViewAnswer();
    } else if (!lastAnswerCorrect) {
      // 答错了：点击继续
      const selectedOption = quizData.options.find(opt => opt.id === selectedOptionId);
      if (selectedOption) {
        onAnswer(selectedOption.wordId, false, isCheated);
      }
    }
    // 答对了会自动跳转，不需要处理
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    viewAnswer: handleViewAnswer,
    isAnswered,
    isCheated,
  }));

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // 按钮配置
  const getButtonConfig = () => {
    if (!isAnswered) {
      return {
        label: '看答案',
        underlineColor: '#ff006e', // 红色
      };
    }
    if (!lastAnswerCorrect) {
      return {
        label: '继续',
        underlineColor: '#06d6a0', // 绿色
      };
    }
    return {
      label: '正在跳转...',
      underlineColor: '#06d6a0', // 绿色
    };
  };

  const buttonConfig = getButtonConfig();
  const actions = [
    {
      label: buttonConfig.label,
      onClick: handleButtonClick,
      underlineColor: buttonConfig.underlineColor,
    },
  ];

  const getOptionClassName = (option: QuizChoiceOptionDto) => {
    if (!isAnswered) {
      return selectedOptionId === option.id ? styles.optionSelected : styles.option;
    }

    const isCorrect = option.wordId === quizData.answerWordId;
    const isSelected = selectedOptionId === option.id;

    // ⭐️ 答错时的延迟显示逻辑
    if (!showCorrectAnswer) {
      // 第 0-1 秒：正确答案还未显示
      if (isSelected && !isCorrect) {
        return styles.optionIncorrect; // 只显示选中的错误选项（红色）
      } else {
        return styles.optionDisabled; // 其他所有选项都是灰色（包括正确答案）
      }
    }

    // ⭐️ 1秒后或答对了，显示完整状态
    if (isCorrect) {
      return styles.optionCorrect; // 正确答案绿色
    } else if (isSelected && !isCorrect) {
      return styles.optionIncorrect; // 选错的红色
    } else {
      return styles.optionDisabled; // 其他选项灰色
    }
  };

  // 判断是否应该显示英文（只有正确答案和选中的选项才显示）
  const shouldShowHeadword = (option: QuizChoiceOptionDto) => {
    if (!isAnswered) return false; // 未作答时不显示英文

    const isCorrect = option.wordId === quizData.answerWordId;
    const isSelected = selectedOptionId === option.id;

    // 只有正确答案或被选中的选项才显示英文
    return isCorrect || isSelected;
  };

  // 将 WordInfo 转换为 WordHeaderData 格式
  const wordHeaderData = {
    headword: word.headword,
    usPhonetic: word.usPhonetic,
    ukPhonetic: word.ukPhonetic,
  };

  return (
    <div className={`${styles.quizContainer} ${className || ''}`}>
      {/* 单词信息区域 */}
      <WordHeader
        data={wordHeaderData}
        currentVoice={currentVoice}
        onPlayAudio={onPlayPronunciation}
      />

      {/* 问题区域 */}
      <div className={styles.questionSection}>

        {/* 选项列表 */}
        <div className={styles.optionsContainer}>
          {quizData.options.map((option, index) => (
            <div
              key={option.id || index}
              className={getOptionClassName(option)}
              onClick={() => handleOptionSelect(option.id || index.toString())}
            >
              <div className={styles.optionContent}>
                <div className={styles.optionHeader}>
                  {option.partOfSpeech && (
                    <span className={styles.partOfSpeech}>{option.partOfSpeech}</span>
                  )}
                  {shouldShowHeadword(option) && (
                    <span className={styles.headword}>{option.headword}</span>
                  )}
                </div>
                <div className={styles.optionText}>{option.meaningCn}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部按钮（可选） */}
      {showActions && <UnderlineActions actions={actions} />}
    </div>
  );
});

WordQuizChoice.displayName = 'WordQuizChoice';

export default WordQuizChoice;
