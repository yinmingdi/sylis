import type { DailyPlanWordDto } from '@sylis/shared/dto';
import { useState, useCallback, useRef } from 'react';

const AUDIO_BASE_URL = 'https://dict.youdao.com/dictvoice?audio=';

/**
 * Hook: 管理单词发音播放
 */
export const useAudio = () => {
  const [currentVoice, setCurrentVoice] = useState<'us' | 'uk'>('us');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 切换发音（美式/英式）
  const toggleVoice = useCallback(() => {
    setCurrentVoice((prev) => (prev === 'us' ? 'uk' : 'us'));
  }, []);

  // 播放单词发音
  const playPronunciation = useCallback(
    (word: DailyPlanWordDto | null, voice?: 'us' | 'uk') => {
      if (!word) return;

      const voiceType = voice || currentVoice;
      const audioUrl =
        voiceType === 'us'
          ? `${AUDIO_BASE_URL}${word.usAudio || word.headword}&type=2`
          : `${AUDIO_BASE_URL}${word.ukAudio || word.headword}&type=1`;

      // 停止当前播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // 播放新音频
      audioRef.current = new Audio(audioUrl);
      audioRef.current.play().catch((error) => {
        console.error('播放音频失败:', error);
      });
    },
    [currentVoice],
  );

  // 停止播放
  const stopPronunciation = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  return {
    currentVoice,
    toggleVoice,
    playPronunciation,
    stopPronunciation,
  };
};
