import { Button } from 'antd-mobile';
import React, { useCallback, useRef } from 'react';
import { AiFillAudio, AiOutlinePlayCircle as PlayOutline } from 'react-icons/ai';

import styles from './index.module.less';

export interface ReadyStageProps {
  /** 参考音频URL */
  referenceAudioUrl?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 开始录音回调 */
  onStartRecording: () => void;
}

const ReadyStage: React.FC<ReadyStageProps> = ({
  referenceAudioUrl,
  disabled = false,
  onStartRecording,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 播放参考音频
  const handlePlayReferenceAudio = useCallback(() => {
    if (referenceAudioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const audio = new Audio(referenceAudioUrl);
      audioRef.current = audio;
      audio.play();
    }
  }, [referenceAudioUrl]);

  return (
    <div className={styles.readyStage}>
      {referenceAudioUrl && (
        <Button
          className={styles.playReferenceButton}
          onClick={handlePlayReferenceAudio}
        >
          <PlayOutline className={styles.playIcon} />
          播放参考
        </Button>
      )}
      <div className={styles.startButtonContainer}>
        <Button
          className={styles.startButton}
          onClick={onStartRecording}
          disabled={disabled}
        >
          <AiFillAudio className={styles.micIcon} />
        </Button>
      </div>
    </div>
  );
};

export default ReadyStage;
