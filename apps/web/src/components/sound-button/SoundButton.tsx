import React from 'react';
import { AiFillSound } from 'react-icons/ai';

import styles from './index.module.less';

interface SoundButtonProps {
  word: string;
  type?: 1 | 2; // 1: 英音, 2: 美音
  size?: 'small' | 'medium' | 'large';
  className?: string;
  onClick?: () => void;
}

const SoundButton: React.FC<SoundButtonProps> = ({
  word,
  type = 1,
  size = 'medium',
  className = '',
  onClick,
}) => {
  const handlePlayAudio = () => {
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
    const audio = new Audio(audioUrl);

    audio.play().catch((error) => {
      console.warn('Audio playback failed:', error);
    });

    onClick?.();
  };

  return (
    <div
      className={`${styles.soundButton} ${styles[size]} ${className}`}
      onClick={handlePlayAudio}
    >
      <AiFillSound className={styles.soundIcon} />
    </div>
  );
};

export default SoundButton;
