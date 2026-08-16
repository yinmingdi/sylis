import React, { useEffect, useState } from 'react';
import { AiOutlineBulb, AiOutlineCheck, AiOutlineClose } from 'react-icons/ai';

import styles from './index.module.less';
import { SpellingInput } from './SpellingInput';

// 单词拼写数据结构
export interface WordSpellingData {
  word: string;
  meaning: string;
  phonetic?: string;
}

interface WordSpellingProps {
  data: WordSpellingData;
  onComplete?: (isCorrect: boolean, userInput: string) => void;
  onClose?: () => void;
}

const WordSpelling: React.FC<WordSpellingProps> = ({
  data,
  onComplete,
  onClose,
}) => {
  const [userInput, setUserInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    setUserInput('');
    setIsSubmitted(false);
    setShowHint(false);
  }, [data.word]);

  const handleHintToggle = () => {
    setShowHint((prev) => !prev);
  };

  const handleCheck = () => {
    if (isSubmitted) return;

    const isCorrect = userInput === data.word;
    setIsSubmitted(true);

    if (!isCorrect) {
      setShowHint(true);
    }

    onComplete?.(isCorrect, userInput);
  };

  const handleEditAfterSubmit = () => {
    if (isSubmitted) {
      setIsSubmitted(false);
      setShowHint(false);
    }
  };

  return (
    <div className={styles.spellingContainer} key={data.word}>
      <div className={styles.mainContent}>
        <div className={styles.wordSection}>
          <SpellingInput
            value={userInput}
            answer={data.word}
            isSubmitted={isSubmitted}
            onChange={setUserInput}
            onSubmit={handleCheck}
            onEditAfterSubmit={handleEditAfterSubmit}
          />
        </div>

        <div className={styles.meaningSection}>
          {showHint ? (
            <div className={styles.englishWord}>{data.word}</div>
          ) : (
            <div className={styles.chineseMeaning}>{data.meaning}</div>
          )}
        </div>
      </div>

      <div className={styles.bottomActions}>
        <button className={styles.actionButton} onClick={onClose}>
          <AiOutlineClose className={styles.buttonIcon} />
        </button>

        <button className={styles.actionButton} onClick={handleHintToggle}>
          <AiOutlineBulb className={styles.buttonIcon} />
        </button>

        <button
          className={styles.actionButton}
          onClick={handleCheck}
          disabled={isSubmitted}
        >
          <AiOutlineCheck className={styles.buttonIcon} />
        </button>
      </div>
    </div>
  );
};

export default WordSpelling;
