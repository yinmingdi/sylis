import ReactECharts from 'echarts-for-react';
import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  AiOutlinePlayCircle as PlayOutline,
  AiOutlinePauseCircle as PauseOutline,
  AiOutlineReload as ReloadOutline
} from 'react-icons/ai';

import styles from './index.module.less';

// 简单的文本组件
const Text: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className, style }) => (
  <span className={className} style={style}>{children}</span>
);

export interface AssessmentResult {
  overallScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  duration: number;
  wordCount: number;
  phonemeCount: number;
  words: Array<{
    word: string;
    score: number;
    confidence: number;
    startTime: number;
    endTime: number;
    duration: number;
    errorType?: string;
    phonemes: Array<{
      phoneme: string;
      score: number;
      confidence: number;
      startTime: number;
      endTime: number;
      duration: number;
      errorType?: string;
    }>;
  }>;
  gopStatistics?: {
    meanGop: number;
    stdGop: number;
    minGop: number;
    maxGop: number;
  };
  errorPhonemes?: string[];
}

export interface ResultStageProps {
  /** 评估结果 */
  assessmentResult: AssessmentResult | null;
  /** 录音音频URL */
  audioUrl: string | null;
  /** 是否正在评估 */
  isAssessing: boolean;
  /** 重新录音回调 */
  onRestart: () => void;
}

const getScoreColor = (score: number) => {
  if (score >= 90) return '#52c41a';
  if (score >= 80) return '#1890ff';
  if (score >= 70) return '#faad14';
  return '#ff4d4f';
};

const ResultStage: React.FC<ResultStageProps> = ({
  assessmentResult,
  audioUrl,
  isAssessing,
  onRestart,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 准备 ECharts 数据
  const chartOption = useMemo(() => {
    if (!assessmentResult || assessmentResult.words.length === 0) {
      return null;
    }

    const phonemes = assessmentResult.words[0].phonemes.slice(0, 6);
    const data = phonemes.map(p => ({
      value: p.score,
      itemStyle: {
        color: getScoreColor(p.score)
      }
    }));
    const labels = phonemes.map(p => p.phoneme);

    return {
      grid: {
        left: 0,
        right: 'auto',
        top: 10,
        bottom: 20,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          fontSize: 10,
          color: '#666',
          fontWeight: 500,
          interval: 0
        },
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        boundaryGap: true
      },
      yAxis: {
        type: 'value',
        show: false,
        max: 100,
        min: 0
      },
      series: [
        {
          type: 'bar',
          data: data,
          barWidth: 10,
          barGap: '20%',
          showBackground: true,
          backgroundStyle: {
            color: 'rgba(180, 180, 180, 0.2)',
            borderRadius: [2, 2, 0, 0]
          },
          itemStyle: {
            borderRadius: [2, 2, 0, 0]
          },
          label: {
            show: false
          }
        }
      ]
    };
  }, [assessmentResult]);

  // 播放录音
  const playRecording = useCallback(() => {
    if (audioUrl) {
      if (audioRef.current) {
        audioRef.current.play();
      } else {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setIsPlaying(false);
        };
        audio.play();
      }
      setIsPlaying(true);
    }
  }, [audioUrl]);

  // 暂停播放
  const pauseRecording = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // 如果正在评估，显示loading
  if (isAssessing || !assessmentResult) {
    return (
      <div className={styles.resultStage}>
        <div className={styles.loadingContainer}>
          <Text className={styles.loadingText}>正在评估发音...</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.resultStage}>
      {/* 顶部：圆形分数 + 音素柱状图 */}
      <div className={styles.scoreDisplay}>
        {/* 左侧：圆形分数 */}
        <div className={styles.circularScore}>
          <div className={styles.scoreCircle}>
            <svg className={styles.scoreRing} viewBox="0 0 100 100">
              <circle
                className={styles.scoreRingBackground}
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#f0f0f0"
                strokeWidth="8"
              />
              <circle
                className={styles.scoreRingProgress}
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={getScoreColor(assessmentResult.overallScore)}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(assessmentResult.overallScore / 100) * 283} 283`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className={styles.scoreText}>
              <Text className={styles.scoreNumber}>
                {Math.round(assessmentResult.overallScore)}分
              </Text>
            </div>
          </div>
          <Text className={styles.scoreLabel}>得分</Text>
        </div>

        {/* 右侧：音素柱状图 */}
        <div className={styles.phonemeChart}>
          {chartOption && (
            <ReactECharts
              option={chartOption}
              style={{ height: '100px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          )}
        </div>
      </div>

      {/* 底部：操作按钮 */}
      <div className={styles.actionButtons}>
        <div className={styles.actionButtonWrapper}>
          <div
            className={styles.actionButton}
            onClick={onRestart}
          >
            <ReloadOutline className={styles.actionIcon} />
          </div>
          <Text className={styles.actionLabel}>重新跟读</Text>
        </div>

        <div className={styles.actionButtonWrapper}>
          <div
            className={styles.actionButton}
            onClick={isPlaying ? pauseRecording : playRecording}
          >
            {isPlaying ? (
              <PauseOutline className={styles.actionIcon} />
            ) : (
              <PlayOutline className={styles.actionIcon} />
            )}
          </div>
          <Text className={styles.actionLabel}>播放跟读</Text>
        </div>
      </div>
    </div>
  );
};

export default ResultStage;

